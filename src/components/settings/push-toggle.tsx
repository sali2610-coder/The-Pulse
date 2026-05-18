"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  Loader2,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { soft, tap } from "@/lib/haptics";
import { toast } from "sonner";

function scopeHeaders(): Record<string, string> {
  return { "x-sally-device": getOrCreateDeviceId() };
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

type Status =
  | "loading"
  | "unsupported"
  | "no-vapid"
  | "denied"
  | "subscribed"
  | "idle";

/**
 * Persistence + reconciliation strategy:
 *
 * iOS Safari (especially in standalone PWA mode) can drop the in-browser
 * PushSubscription between cold-starts even when both the SW and the
 * server-side record are intact. Reading just `pushManager.getSubscription()`
 * leads to false "off" — the toggle resets and the user keeps re-enabling
 * something that's actually still active server-side.
 *
 * On mount we triangulate THREE signals:
 *
 *   1. Notification.permission                (browser)
 *   2. pushManager.getSubscription()          (browser)
 *   3. GET /api/push/subscribe (`subscribed`) (server / KV)
 *
 *   permission === "granted"
 *     ∧ server says subscribed
 *     ∧ local sub is missing
 *       → silently re-subscribe (push the new endpoint to the server).
 *
 *   permission === "granted"
 *     ∧ local sub exists
 *       → "subscribed"
 *
 *   permission === "default"
 *     ∧ server says subscribed
 *       → server-record is stale; clean it up server-side and fall to
 *         "idle" so the user can opt-in cleanly.
 *
 * The toggle never flips OFF unless the user explicitly disables, the
 * browser denies permission, or VAPID/SW is misconfigured.
 */
export function PushToggle() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  // Once we've successfully reconciled on mount we mark this so a re-fire
  // (e.g. visibility change) skips the silent-resubscribe attempt.
  const reconciledRef = useRef(false);

  const subscribeAndPersist = useCallback(
    async (
      reg: ServiceWorkerRegistration,
    ): Promise<{ ok: boolean; reason?: string }> => {
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const json = sub.toJSON() as {
          endpoint?: string;
          keys?: { p256dh?: string; auth?: string };
        };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          return { ok: false, reason: "invalid_subscription" };
        }
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...scopeHeaders() },
          credentials: "same-origin",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          }),
        });
        if (!res.ok) return { ok: false, reason: "persist_failed" };
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "subscribe_failed",
        };
      }
    },
    [],
  );

  // ── On-mount reconciliation ────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("no-vapid");
        return;
      }
      const perm = Notification.permission;
      if (perm === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      // Probe server-side state in parallel with the browser-side state.
      const [reg, serverState] = await Promise.all([
        navigator.serviceWorker.getRegistration().catch(() => undefined),
        fetch("/api/push/subscribe", {
          method: "GET",
          headers: scopeHeaders(),
          credentials: "same-origin",
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<{ subscribed?: boolean } | null>,
      ]);

      const serverHasSub = Boolean(serverState?.subscribed);
      const localSub = reg ? await reg.pushManager.getSubscription() : null;

      if (perm === "granted") {
        if (localSub) {
          if (!cancelled) {
            setStatus("subscribed");
            reconciledRef.current = true;
          }
          return;
        }
        // Permission granted but no local sub. If the server thinks we're
        // subscribed (or even if it doesn't — we still have permission)
        // silently re-subscribe so the toggle reflects reality.
        if (reg && !reconciledRef.current) {
          const result = await subscribeAndPersist(reg);
          if (cancelled) return;
          reconciledRef.current = true;
          setStatus(result.ok ? "subscribed" : "idle");
          if (!result.ok && serverHasSub) {
            // Server record is stale and we can't refresh — purge it.
            await fetch("/api/push/subscribe", {
              method: "DELETE",
              headers: scopeHeaders(),
              credentials: "same-origin",
            }).catch(() => undefined);
          }
          return;
        }
        // No SW registered yet — user must opt in to register one.
        if (!cancelled) setStatus("idle");
        return;
      }

      // Permission "default" (never asked). If the server somehow still has
      // an orphan record, clear it so we don't lie to the user.
      if (serverHasSub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: scopeHeaders(),
          credentials: "same-origin",
        }).catch(() => undefined);
      }
      if (!cancelled) setStatus("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, subscribeAndPersist]);

  // ── Visibility recovery ────────────────────────────────────────────
  // When the user comes back to the PWA after a long background, re-check
  // that the subscription is still alive. iOS occasionally invalidates the
  // endpoint silently; the server returns 410 on the next push.
  useEffect(() => {
    if (!hydrated) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Notification.permission !== "granted") return;
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => {
          if (!sub) {
            // Force a re-reconcile by toggling status; the mount effect
            // depends on hydrated only, so we reuse the in-page handler.
            setStatus("loading");
            reconciledRef.current = false;
            // Manually re-run the reconcile by reading from state — this
            // is the cheapest path; we just trigger the same logic by
            // bumping a key dep. Simpler: call the subscribe-and-persist
            // helper directly.
            navigator.serviceWorker.getRegistration().then(async (r) => {
              if (!r) {
                setStatus("idle");
                return;
              }
              const result = await subscribeAndPersist(r);
              setStatus(result.ok ? "subscribed" : "idle");
            });
          }
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hydrated, subscribeAndPersist]);

  if (!hydrated) return null;

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("denied");
        toast.warning("ההרשאה לא ניתנה");
        return;
      }
      const result = await subscribeAndPersist(reg);
      if (!result.ok) {
        toast.error(
          result.reason === "persist_failed"
            ? "שמירת הרישום נכשלה"
            : "רישום ל־Web Push נכשל",
        );
        return;
      }
      setStatus("subscribed");
      reconciledRef.current = true;
      tap();
      toast.success("התראות הופעלו");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: scopeHeaders(),
        credentials: "same-origin",
      });
      setStatus("idle");
      reconciledRef.current = true;
      tap();
      toast.success("התראות בוטלו");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    soft();
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: scopeHeaders(),
        credentials: "same-origin",
      });
      if (res.status === 503) {
        toast.error("VAPID לא מוגדר בשרת");
        return;
      }
      if (res.status === 404) {
        toast.warning("אין רישום פעיל. נסה להפעיל שוב את ההתראות.");
        return;
      }
      if (res.status === 410) {
        toast.warning("הרישום פג. אנא הפעל שוב.");
        setStatus("idle");
        return;
      }
      if (!res.ok) {
        toast.error("שליחת התראת בדיקה נכשלה");
        return;
      }
      toast.success("נשלחה התראת בדיקה — בדוק את ה־iPhone");
    } finally {
      setBusy(false);
    }
  };

  const isOn = status === "subscribed";
  const isLoading = status === "loading";

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : isOn ? (
          <Bell className="size-4 text-neon" />
        ) : (
          <BellOff className="size-4 text-muted-foreground" />
        )}
        <div>
          <div className="text-sm font-medium text-foreground">
            התראות Tap-to-Pulse
          </div>
          <div className="text-[11px] text-muted-foreground">
            כל חיוב חדש יציג התראה עם בחירת קטגוריה מהירה
          </div>
        </div>
      </header>

      {status === "loading" ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          בודק רישום קיים…
        </div>
      ) : status === "unsupported" ? (
        <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-2.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            הדפדפן הזה לא תומך ב־Web Push. iOS דורש 16.4+ ו־&quot;Add to Home
            Screen&quot;.
          </span>
        </div>
      ) : status === "no-vapid" ? (
        <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-2.5 text-[11px] text-foreground/90">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-gold" />
          <span>
            חסר <code className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>.
            הרץ <code className="font-mono">npx web-push generate-vapid-keys</code>{" "}
            והוסף ל־Vercel envs.
          </span>
        </div>
      ) : status === "denied" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            ההרשאה נדחתה. לאפשר ידנית: Settings → Notifications → Sally → Allow.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={isOn ? disable : enable}
            disabled={busy}
            dir="ltr"
            className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
              isOn
                ? "border-[color:var(--neon)]/70 bg-[color:var(--neon)]/20 shadow-[inset_0_0_0_1px_var(--neon),0_0_12px_-2px_var(--neon)]"
                : "border-border/60 bg-background/40"
            } disabled:opacity-50`}
            aria-pressed={isOn}
            aria-label={isOn ? "כבה התראות" : "הפעל התראות"}
          >
            <motion.span
              initial={false}
              animate={{
                x: isOn ? 24 : 2,
                backgroundColor: isOn ? "#00E5FF" : "#A1A1AA",
              }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="block h-6 w-6 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
            />
          </button>
          {isOn && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={sendTest}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/10 px-3 py-1.5 text-[11px] font-medium text-neon transition-colors hover:bg-neon/15 disabled:opacity-50"
            >
              <Send className="size-3" strokeWidth={2} />
              שלח התראת בדיקה
            </motion.button>
          )}
        </div>
      )}
    </section>
  );
}
