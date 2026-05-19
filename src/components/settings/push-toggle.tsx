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
const IS_DEV = process.env.NODE_ENV !== "production";

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
 * Reconciliation policy (Phase 58):
 *
 * iOS Safari PWA refuses `pushManager.subscribe()` without a fresh user
 * gesture. The "silent re-subscribe in useEffect" approach from Phase 50
 * therefore failed every cold-start (NotAllowedError), driving the
 * toggle to OFF even when the server still had a valid subscription
 * endpoint.
 *
 * Correct model: the SERVER record is the source of truth.
 *
 *   server has subscription
 *     → "subscribed" (regardless of browser state)
 *     → if the browser-side sub matches, great; if it doesn't, web-push
 *       will surface a 410 on the next push and the server self-cleans
 *
 *   server has NO subscription + browser has a local sub
 *     → POST it to the server (no user gesture needed for fetch),
 *       then "subscribed"
 *
 *   server has NO subscription + browser has NO sub + permission granted
 *     → "idle"  (user must tap to re-subscribe; iOS requires the gesture)
 *
 *   permission denied
 *     → "denied"
 */
export function PushToggle() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<string | null>(null);
  const reconciledRef = useRef(false);

  const persistSub = useCallback(
    async (sub: PushSubscription): Promise<boolean> => {
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return false;
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
      return res.ok;
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

      // Probe server-side first — it's the authoritative state.
      const serverState = (await fetch("/api/push/subscribe", {
        method: "GET",
        headers: scopeHeaders(),
        credentials: "same-origin",
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { subscribed?: boolean } | null;
      const serverHasSub = Boolean(serverState?.subscribed);

      // Browser-side check (informational; iOS may return null even when
      // the endpoint is alive server-side).
      const reg = await navigator.serviceWorker
        .getRegistration()
        .catch(() => undefined);
      const localSub = reg
        ? await reg.pushManager.getSubscription().catch(() => null)
        : null;

      const dbg = `perm=${perm} reg=${reg ? "yes" : "no"} localSub=${
        localSub ? "yes" : "no"
      } serverSub=${serverHasSub ? "yes" : "no"}`;
      if (IS_DEV && !cancelled) setDebug(dbg);
      if (typeof window !== "undefined") {
        console.info("[PushToggle reconcile]", dbg);
      }

      // 1) Server is source of truth. If it has a record, toggle is ON.
      if (serverHasSub) {
        if (!cancelled) {
          setStatus("subscribed");
          reconciledRef.current = true;
        }
        return;
      }

      // 2) Server empty but browser has a sub → save it server-side
      //    (no user gesture needed for a fetch).
      if (localSub) {
        const ok = await persistSub(localSub);
        if (!cancelled) {
          setStatus(ok ? "subscribed" : "idle");
          reconciledRef.current = true;
        }
        return;
      }

      // 3) Nothing on either side — user must tap to enable (iOS requires
      //    the user gesture for pushManager.subscribe()).
      if (!cancelled) {
        setStatus("idle");
        reconciledRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, persistSub]);

  // Visibility recovery — if browser endpoint dies while we're idle,
  // re-probe the server.
  useEffect(() => {
    if (!hydrated) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reconciledRef.current = false;
      setStatus("loading");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hydrated]);

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
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const ok = await persistSub(sub);
      if (!ok) {
        toast.error("שמירת הרישום נכשלה");
        return;
      }
      setStatus("subscribed");
      reconciledRef.current = true;
      tap();
      toast.success("התראות הופעלו");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "subscribe_failed";
      toast.error(`רישום נכשל: ${msg}`);
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
        <div className="flex flex-col gap-2">
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
          {IS_DEV && debug ? (
            <div
              dir="ltr"
              className="rounded-md border border-white/8 bg-background/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
            >
              {debug}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
