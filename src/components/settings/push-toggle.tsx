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
import { PushDiagnostics } from "./push-diagnostics";

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
  | "needs-repair"
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
  // Bumped every time the user returns to the tab; the reconcile
  // effect watches this so its async work re-runs after foreground.
  // Without it the effect only fires once on mount and a visibility-
  // triggered setStatus("loading") would strand the UI forever.
  const [reconcileTick, setReconcileTick] = useState(0);
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

      // Probe server + browser in parallel. EACH probe is wrapped in
      // a 5s timeout so a single hung promise (slow iOS network, stuck
      // SW) can't strand the toggle on "loading" forever.
      const timeout = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((resolve) =>
            setTimeout(() => resolve(fallback), 5000),
          ),
        ]);

      const [serverStateRaw, reg] = await Promise.all([
        timeout(
          fetch("/api/push/subscribe", {
            method: "GET",
            headers: scopeHeaders(),
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          null as unknown,
        ),
        timeout(
          navigator.serviceWorker.getRegistration().catch(() => undefined),
          undefined as ServiceWorkerRegistration | undefined,
        ),
      ]);
      const serverState = serverStateRaw as
        | { subscribed?: boolean; endpoint?: string }
        | null;
      const serverHasSub = Boolean(serverState?.subscribed);
      const serverEndpoint = serverState?.endpoint;

      const localSub = reg
        ? await timeout(
            reg.pushManager.getSubscription().catch(() => null),
            null as PushSubscription | null,
          )
        : null;
      const localEndpoint = localSub?.endpoint;

      const dbg = `perm=${perm} reg=${reg ? "yes" : "no"} localSub=${
        localSub ? "yes" : "no"
      } serverSub=${serverHasSub ? "yes" : "no"}${
        localEndpoint && serverEndpoint && localEndpoint !== serverEndpoint
          ? " ENDPOINT_DRIFT"
          : ""
      }`;
      if (IS_DEV && !cancelled) setDebug(dbg);
      console.info("[PushToggle reconcile]", dbg);

      // Endpoint drift: browser has a sub but it doesn't match what
      // the server has stored — push the live endpoint up.
      if (localSub && serverHasSub && localEndpoint !== serverEndpoint) {
        console.info("[PushToggle] endpoint drift — refreshing server record");
        const ok = await persistSub(localSub);
        if (!cancelled) {
          setStatus(ok ? "subscribed" : "needs-repair");
          reconciledRef.current = true;
        }
        return;
      }

      // Server has a record + local sub matches → fully synced.
      if (serverHasSub && localSub) {
        if (!cancelled) {
          setStatus("subscribed");
          reconciledRef.current = true;
        }
        return;
      }

      // SERVER-ONLY state: server thinks we're subscribed but this
      // browser has no SW / no PushSubscription. Happens when the user
      // reinstalls the PWA, clears Safari data, or the previous SW was
      // unregistered. Toggle MUST NOT show ON — surface a repair CTA so
      // the user knows their iPhone isn't actually listening.
      if (serverHasSub && !localSub) {
        if (!cancelled) {
          setStatus("needs-repair");
          reconciledRef.current = true;
        }
        return;
      }

      // Server empty + browser has a sub → save it.
      if (localSub) {
        const ok = await persistSub(localSub);
        if (!cancelled) {
          setStatus(ok ? "subscribed" : "idle");
          reconciledRef.current = true;
        }
        return;
      }

      // Nothing anywhere — user must tap to enable.
      if (!cancelled) {
        setStatus("idle");
        reconciledRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, persistSub, reconcileTick]);

  // Visibility recovery — if browser endpoint dies while we're idle,
  // bump the reconcile tick so the effect above re-runs. Setting
  // status back to "loading" alone wouldn't refire the effect (its
  // deps don't watch status), which used to strand the UI in Phase 197.
  useEffect(() => {
    if (!hydrated) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reconciledRef.current = false;
      setStatus("loading");
      setReconcileTick((n) => n + 1);
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

  /**
   * Full repair flow — called from the "Repair notifications" CTA when
   * the server has a record but the browser doesn't. Walks every step
   * a fresh PWA install would do, all inside a single user gesture so
   * iOS Safari accepts the subscribe() call.
   */
  const repair = async () => {
    if (busy) return;
    setBusy(true);
    setDebug("repair: starting");
    try {
      // 1. Service worker (overwrite stale registrations to be safe).
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;
      setDebug("repair: sw active");

      // 2. Permission. Always re-prompt — iOS may have reset it.
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("denied");
        toast.warning("ההרשאה לא ניתנה");
        return;
      }

      // 3. Clear any half-broken local sub before subscribing.
      const stale = await reg.pushManager.getSubscription().catch(() => null);
      if (stale) {
        await stale.unsubscribe().catch(() => undefined);
      }

      // 4. Fresh subscription bound to current VAPID key.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      setDebug(`repair: subscribed host=${new URL(sub.endpoint).host}`);

      // 5. Tell the server about it.
      const ok = await persistSub(sub);
      if (!ok) {
        toast.error("שמירת הרישום נכשלה");
        return;
      }

      setStatus("subscribed");
      reconciledRef.current = true;
      tap();
      toast.success("ההתראות תוקנו ומחוברות עכשיו");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "repair_failed";
      setDebug(`repair: failed ${msg}`);
      toast.error(`תיקון נכשל: ${msg}`);
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
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        externalId?: string;
        pushStatus?: number;
        endpointHost?: string;
      };
      const detail =
        body.pushStatus || body.endpointHost
          ? ` (${[body.pushStatus, body.endpointHost].filter(Boolean).join(" · ")})`
          : "";
      console.info("[push-test]", res.status, body);
      if (IS_DEV) {
        setDebug(
          `test: status=${res.status} push=${body.pushStatus ?? "?"} host=${body.endpointHost ?? "?"} err=${body.error ?? "-"}`,
        );
      }
      if (res.status === 503) {
        toast.error("VAPID לא מוגדר בשרת");
        return;
      }
      if (res.status === 404) {
        toast.warning("אין רישום פעיל. נסה להפעיל שוב את ההתראות.");
        setStatus("idle");
        return;
      }
      if (res.status === 410) {
        toast.warning("הרישום פג. הפעל שוב את ההתראות.");
        setStatus("idle");
        return;
      }
      if (!res.ok) {
        toast.error(`שליחה נכשלה: ${body.error ?? "push_failed"}${detail}`);
        return;
      }
      toast.success(
        `נשלחה התראת בדיקה${detail}. אם לא הופיעה: נעל את המסך + ודא iOS Settings → Notifications → Sally → Allow.`,
      );
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
      ) : status === "needs-repair" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-gold/40 bg-gold/8 p-3 text-[11px] text-foreground/90">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <div className="flex flex-col gap-1">
              <strong className="text-foreground">חיבור התראות לא מסונכרן</strong>
              <span className="text-muted-foreground">
                בשרת יש רישום קיים אבל ה־iPhone הזה לא רשום כרגע (התקנה
                מחדש או ניקוי דפדפן). יש לחדש את החיבור.
              </span>
            </div>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={repair}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl border border-gold/50 bg-gold/15 px-3 py-2.5 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Bell className="size-3.5" />
            )}
            תקן התראות עכשיו
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {/* Toggle anchored absolutely so the knob position is independent
                of the page's RTL flow. ON → knob on the right + neon glow.
                OFF → knob on the left. */}
            <button
              type="button"
              onClick={isOn ? disable : enable}
              disabled={busy}
              dir="ltr"
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
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
                  left: isOn ? "24px" : "2px",
                  backgroundColor: isOn ? "#00E5FF" : "#A1A1AA",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className="absolute top-1/2 block h-6 w-6 -translate-y-1/2 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
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
          {debug ? (
            <div
              dir="ltr"
              className="rounded-md border border-white/8 bg-background/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
            >
              {debug}
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-4">
        <PushDiagnostics />
      </div>
    </section>
  );
}
