"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CloudDownload, History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { getOrCreateDeviceId } from "@/lib/device-id";
import { tap } from "@/lib/haptics";

type Summary = { updatedAt: number; richness: number } | null;

type Probe =
  | { state: "loading" }
  | { state: "no-session" }
  | { state: "no-device-backup"; user: Summary }
  | {
      state: "available";
      user: Summary;
      device: Summary;
      deviceTxCount: number;
      deviceIsRicher: boolean;
      deviceIsNewer: boolean;
    };

const ILS_DATE = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function fmtTime(ts: number | null | undefined): string {
  if (typeof ts !== "number" || ts <= 0) return "—";
  try {
    return ILS_DATE.format(new Date(ts));
  } catch {
    return "—";
  }
}

/**
 * Defensive recovery panel. Only shown when the signed-in user has a
 * device-scoped blob still alive in KV (the original local backup that
 * lived before the first Google sign-in). Lets the user pull that backup
 * forward in two taps without DevTools.
 *
 * Renders nothing when:
 *   - auth disabled
 *   - no session
 *   - no device backup exists for this device id
 */
export function DeviceRecoveryCard() {
  const [probe, setProbe] = useState<Probe>({ state: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Need an active session before recover-device returns anything.
        const sessionRes = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const session = (await sessionRes.json().catch(() => null)) as
          | { user?: { email?: string } }
          | null;
        if (cancelled) return;
        if (!session?.user?.email) {
          setProbe({ state: "no-session" });
          return;
        }

        // 2. Ask the server what's stored.
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(
          `/api/auth/recover-device?deviceId=${encodeURIComponent(deviceId)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setProbe({ state: "no-device-backup", user: null });
          return;
        }
        const data = (await res.json()) as {
          user: Summary;
          device: Summary;
          deviceTxCount?: number;
        };
        if (cancelled) return;

        const deviceTxCount = data.deviceTxCount ?? 0;
        const deviceRichness = data.device?.richness ?? 0;

        // Nothing to recover when neither the state blob nor the tx
        // queue has anything under the device prefix.
        if (deviceRichness === 0 && deviceTxCount === 0) {
          setProbe({ state: "no-device-backup", user: data.user });
          return;
        }

        const userRichness = data.user?.richness ?? 0;
        const userUpdated = data.user?.updatedAt ?? 0;
        const deviceUpdated = data.device?.updatedAt ?? 0;
        setProbe({
          state: "available",
          user: data.user,
          device: data.device,
          deviceTxCount,
          deviceIsRicher: deviceRichness > userRichness,
          deviceIsNewer: deviceUpdated > userUpdated,
        });
      } catch {
        if (!cancelled) setProbe({ state: "no-device-backup", user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async (strategy: "newest" | "force-device") => {
    if (busy) return;
    setBusy(true);
    tap();
    try {
      const res = await fetch("/api/auth/recover-device", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getOrCreateDeviceId(),
          strategy,
        }),
      });
      if (!res.ok) {
        toast.error("שחזור נכשל");
        return;
      }
      const data = (await res.json()) as {
        migrated?: string;
        txMoved?: number;
      };
      const stateChanged =
        data.migrated && data.migrated !== "no-op" && data.migrated !== "kept-user";
      const txMoved = data.txMoved ?? 0;
      if (!stateChanged && txMoved === 0) {
        toast.info("הנתונים שלך כבר עדכניים");
      } else {
        const parts: string[] = [];
        if (stateChanged) parts.push("נתונים שוחזרו");
        if (txMoved > 0) parts.push(`${txMoved} חיובים הועברו`);
        toast.success(`${parts.join(" · ")} · טוען מחדש…`);
        setTimeout(() => {
          window.location.reload();
        }, 400);
      }
    } catch {
      toast.error("שחזור נכשל");
    } finally {
      setBusy(false);
    }
  };

  // Don't render when nothing to offer.
  if (probe.state === "loading") return null;
  if (probe.state === "no-session") return null;
  if (probe.state === "no-device-backup") return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-gold/30 bg-gradient-to-b from-gold/[0.08] to-transparent p-5 backdrop-blur-md"
    >
      <header className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <History className="size-5" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">
            גיבוי מקומי זמין
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            במכשיר הזה יש גיבוי מהתקופה לפני ההתחברות ל־Google.
            {probe.deviceTxCount > 0 ? (
              <>
                {" "}
                כולל{" "}
                <strong className="text-foreground">
                  {probe.deviceTxCount}
                </strong>{" "}
                חיובים שעוד לא הועברו לחשבון.
              </>
            ) : null}
            {" "}
            אם הדאשבורד שלך לא מציג את הנתונים שאתה זוכר — אפשר לשחזר
            מכאן.
          </p>
        </div>
      </header>

      <div
        dir="ltr"
        className="mt-4 grid grid-cols-2 gap-2 text-right text-[11px] text-muted-foreground"
      >
        <Stat
          label="חשבון Google"
          richness={probe.user?.richness ?? 0}
          updatedAt={probe.user?.updatedAt ?? 0}
        />
        <Stat
          label="גיבוי מקומי"
          richness={probe.device?.richness ?? 0}
          updatedAt={probe.device?.updatedAt ?? 0}
          highlight={probe.deviceIsRicher || probe.deviceIsNewer}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => restore("newest")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-3 py-2.5 text-[12px] font-medium text-[color:var(--neon)] transition-colors hover:bg-[color:var(--neon)]/15 disabled:opacity-50"
        >
          <ShieldCheck className="size-3.5" />
          שחזור חכם — שמירת החדש מבין השניים
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => restore("force-device")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-[12px] font-medium text-gold transition-colors hover:bg-gold/15 disabled:opacity-50"
        >
          <CloudDownload className="size-3.5" />
          שחזור מלא מהגיבוי המקומי
        </motion.button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <RefreshCw className="size-3" />
        השחזור לא מוחק את הגיבוי. אפשר לחזור ולנסות שוב.
      </p>
    </motion.section>
  );
}

function Stat({
  label,
  richness,
  updatedAt,
  highlight,
}: {
  label: string;
  richness: number;
  updatedAt: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        highlight
          ? "border-gold/40 bg-gold/8"
          : "border-white/8 bg-background/30"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-1 text-base font-medium text-foreground"
        data-mono="true"
      >
        {richness}
        <span className="ms-1 text-[10px] text-muted-foreground">items</span>
      </div>
      <div className="text-[10px] text-muted-foreground" dir="rtl">
        {fmtTime(updatedAt)}
      </div>
    </div>
  );
}
