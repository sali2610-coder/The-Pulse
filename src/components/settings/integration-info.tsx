"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Smartphone, RotateCcw, ShieldAlert } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import {
  getOrCreateDeviceId,
  deviceIdAgeDays,
  rotateDeviceId,
  DEVICE_ID_ROTATION_DAYS,
} from "@/lib/device-id";
import { tap } from "@/lib/haptics";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      tap();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older Safari without clipboard permission — fall back silently.
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="ok"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1 text-gold"
              >
                <Check className="size-3" /> הועתק
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1"
              >
                <Copy className="size-3" /> העתק
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      <div
        data-mono="true"
        className="mt-1 break-all text-[11px] text-foreground"
        style={{ direction: "ltr", textAlign: "left" }}
      >
        {value}
      </div>
    </div>
  );
}

export function IntegrationInfo() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const lastSyncedAt = useFinanceStore((s) => s.lastSyncedAt);
  const [rotateBump, setRotateBump] = useState(0);

  // Render nothing until the persist layer has hydrated; this guarantees
  // we're on the client and `localStorage` / `window` are available, so we
  // can compute deviceId synchronously without an effect.
  if (!hydrated) return null;
  if (typeof window === "undefined") return null;

  // rotateBump is a noop reference so the IDE / compiler keeps the deps
  // clean; the real read happens via getOrCreateDeviceId after rotation.
  void rotateBump;

  const deviceId = getOrCreateDeviceId();
  const ageDays = deviceIdAgeDays();
  const dueRotation = ageDays >= DEVICE_ID_ROTATION_DAYS;
  const webhookUrl = `${window.location.origin}/api/webhooks/transactions`;
  const lastSync =
    lastSyncedAt > 0
      ? new Date(lastSyncedAt).toLocaleTimeString("he-IL")
      : "טרם סונכרן";

  const handleRotate = () => {
    if (
      !confirm(
        "רענון Device ID יבטל את ה־Shortcut הקיים — תצטרך לעדכן ב־iPhone את ה־header החדש. להמשיך?",
      )
    ) {
      return;
    }
    rotateDeviceId();
    tap();
    setRotateBump((n) => n + 1);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        <Smartphone className="size-4 text-neon" />
        <div>
          <div className="text-sm font-medium text-foreground">
            חיבור ה־iPhone
          </div>
          <div className="text-[11px] text-muted-foreground">
            העתק את הערכים האלה ל־Shortcut. ראה{" "}
            <code className="font-mono">docs/ios-shortcut.md</code> במאגר.
          </div>
        </div>
      </header>

      {dueRotation ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-2.5 text-[11px] text-foreground/90"
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-gold" />
          <span>
            ה־Device ID שלך בן {ageDays} יום. מומלץ לרענן ולעדכן את ה־Shortcut.
          </span>
        </motion.div>
      ) : null}

      <div className="space-y-2">
        <CopyRow label="Device ID" value={deviceId} />
        <CopyRow label="Webhook URL" value={webhookUrl} />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>סנכרון אחרון</span>
        <span data-mono="true" style={{ direction: "ltr" }}>
          {lastSync}
        </span>
      </div>

      <button
        type="button"
        onClick={handleRotate}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground"
      >
        <RotateCcw className="size-3" />
        רענן Device ID
      </button>
    </section>
  );
}
