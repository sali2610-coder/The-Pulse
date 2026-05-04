"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, ShieldAlert } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { tap } from "@/lib/haptics";
import { toast } from "sonner";

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
        headers: {
          "Content-Type": "application/json",
          "x-sally-device": getOrCreateDeviceId(),
        },
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
        headers: { "x-sally-device": getOrCreateDeviceId() },
      });
      setStatus("idle");
      tap();
      toast.success("התראות בוטלו");
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
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={isOn ? disable : enable}
          disabled={busy}
          className={`relative flex h-9 w-16 items-center rounded-full border transition-colors ${
            isOn ? "border-neon/50 bg-neon/15" : "border-border/60 bg-background/40"
          }`}
          aria-pressed={isOn}
          aria-label={isOn ? "כבה התראות" : "הפעל התראות"}
        >
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`block h-7 w-7 rounded-full ${
              isOn ? "ms-auto me-1 bg-neon" : "ms-1 bg-muted"
            }`}
          />
        </motion.button>
      )}
    </section>
  );
}
