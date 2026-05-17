"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, Send, ShieldAlert } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { soft, tap } from "@/lib/haptics";
import { toast } from "sonner";
import { AUTH_ENABLED } from "@/lib/auth-config";

function scopeHeaders(): Record<string, string> {
  return AUTH_ENABLED ? {} : { "x-sally-device": getOrCreateDeviceId() };
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

export function PushToggle() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    // We do all probing in an async helper so the "set initial state" steps
    // are mounted in a single transition rather than cascading via repeated
    // synchronous setStates.
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("no-vapid");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(sub ? "subscribed" : "idle");
      } catch {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  if (!hydrated) return null;

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
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
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error("רישום לא תקין");
        return;
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
      if (!res.ok) {
        toast.error("שמירת הרישום נכשלה");
        return;
      }
      setStatus("subscribed");
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

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        {isOn ? (
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

      {status === "unsupported" ? (
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
          {/* iOS-style switch. Deterministic positioning via transform so the
              knob always lands cleanly in RTL — the prior `ms-auto me-1`
              approach didn't animate correctly inside RTL flex. */}
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
