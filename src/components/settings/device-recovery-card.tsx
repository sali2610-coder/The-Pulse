"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CloudDownload,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
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

type OrphanRow = {
  deviceId: string;
  richness: number;
  updatedAt: number;
  txCount: number;
  claimedByMe: boolean;
  claimedByOrphan?: boolean;
  claimedUserId?: string;
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

function shortDevice(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function DeviceRecoveryCard() {
  const [probe, setProbe] = useState<Probe>({ state: "loading" });
  const [busy, setBusy] = useState(false);

  const [orphansOpen, setOrphansOpen] = useState(false);
  const [orphansLoading, setOrphansLoading] = useState(false);
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);

  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<
    Array<{
      capturedAt: number;
      reason: string;
      richness: number;
      updatedAt: number;
    }>
    | null
  >(null);

  const currentDeviceId =
    typeof window !== "undefined" ? getOrCreateDeviceId() : "";

  // ── Current-device probe ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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

  // ── Restore current device ────────────────────────────────────────
  const restore = async (
    strategy: "newest" | "force-device" | "takeover",
    deviceId: string = currentDeviceId,
  ) => {
    if (busy) return;
    setBusy(true);
    tap();
    try {
      const res = await fetch("/api/auth/recover-device", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, strategy }),
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

  // ── Orphan-device search ──────────────────────────────────────────
  const loadOrphans = useCallback(async () => {
    setOrphansLoading(true);
    try {
      const res = await fetch("/api/auth/recoverable-devices", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setOrphans([]);
        return;
      }
      const data = (await res.json()) as { candidates: OrphanRow[] };
      const filtered = (data.candidates ?? []).filter(
        (c) => c.deviceId !== currentDeviceId,
      );
      setOrphans(filtered);
    } catch {
      setOrphans([]);
    } finally {
      setOrphansLoading(false);
    }
  }, [currentDeviceId]);

  const toggleOrphans = () => {
    if (!orphansOpen && orphans === null) {
      void loadOrphans();
    }
    setOrphansOpen((v) => !v);
  };

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      const res = await fetch("/api/auth/snapshots", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setSnapshots([]);
        return;
      }
      const data = (await res.json()) as {
        snapshots: typeof snapshots;
      };
      setSnapshots(data.snapshots ?? []);
    } catch {
      setSnapshots([]);
    } finally {
      setSnapshotsLoading(false);
    }
  }, []);

  const toggleSnapshots = () => {
    if (!snapshotsOpen && snapshots === null) {
      void loadSnapshots();
    }
    setSnapshotsOpen((v) => !v);
  };

  const restoreSnapshot = async (capturedAt: number) => {
    if (busy) return;
    setBusy(true);
    tap();
    try {
      const res = await fetch("/api/auth/snapshots", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capturedAt }),
      });
      if (!res.ok) {
        toast.error("שחזור נכשל");
        return;
      }
      toast.success("הגיבוי שוחזר. טוען מחדש…");
      setTimeout(() => window.location.reload(), 400);
    } catch {
      toast.error("שחזור נכשל");
    } finally {
      setBusy(false);
    }
  };

  const reasonLabel = (r: string) => {
    if (r === "pre-claim-device") return "לפני התחברות Google";
    if (r === "pre-recover-device") return "לפני שחזור קודם";
    if (r === "pre-restore") return "לפני rollback";
    return r;
  };

  if (probe.state === "loading") return null;
  if (probe.state === "no-session") return null;

  const cardVisible = probe.state === "available";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-gold/30 bg-gradient-to-b from-gold/[0.08] to-transparent p-5 backdrop-blur-md"
    >
      {cardVisible ? (
        <>
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
                {" "}אם הדאשבורד שלך לא מציג את הנתונים שאתה זוכר — אפשר לשחזר
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
        </>
      ) : (
        <header className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <History className="size-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              חיפוש גיבויים ישנים
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              חסר לך מידע ישן? אם ה־deviceId של הדפדפן השתנה (התקנה מחדש,
              ניקוי דפדפן), הגיבוי לא נמחק — אפשר לחפש אותו.
            </p>
          </div>
        </header>
      )}

      {/* Orphan-device discovery */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <button
          type="button"
          onClick={toggleOrphans}
          className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Search className="size-3" />
            מצא גיבויים נוספים מהחשבון שלי
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em]">
            {orphansOpen ? "סגור" : "פתח"}
          </span>
        </button>

        {orphansOpen ? (
          <div className="mt-3 flex flex-col gap-2">
            {orphansLoading ? (
              <div className="text-[11px] text-muted-foreground">סורק…</div>
            ) : orphans && orphans.length > 0 ? (
              orphans.map((o) => {
                const isOrphan = !o.claimedByMe && o.claimedByOrphan;
                const strategy: "force-device" | "takeover" = isOrphan
                  ? "takeover"
                  : "force-device";
                return (
                  <div
                    key={o.deviceId}
                    className={`flex items-center gap-2 rounded-2xl border p-3 ${
                      isOrphan
                        ? "border-[color:var(--neon)]/30 bg-[color:var(--neon)]/8"
                        : "border-white/8 bg-background/30"
                    }`}
                  >
                    <div className="flex-1 text-right">
                      <div
                        data-mono="true"
                        dir="ltr"
                        className="text-[11px] text-foreground"
                      >
                        {shortDevice(o.deviceId)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {o.richness} items · {o.txCount} txs ·{" "}
                        {fmtTime(o.updatedAt)}
                      </div>
                      {isOrphan ? (
                        <div className="mt-0.5 text-[10px] text-[color:var(--neon)]/80">
                          התחברות ישנה שפג תוקפה — אפשר לאמץ
                        </div>
                      ) : null}
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => restore(strategy, o.deviceId)}
                      disabled={busy}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        isOrphan
                          ? "border-[color:var(--neon)]/50 bg-[color:var(--neon)]/15 text-[color:var(--neon)] hover:bg-[color:var(--neon)]/25"
                          : "border-gold/40 bg-gold/10 text-gold hover:bg-gold/15"
                      }`}
                    >
                      {isOrphan ? "אמץ ושחזר" : "שחזר"}
                    </motion.button>
                  </div>
                );
              })
            ) : (
              <div className="text-[11px] text-muted-foreground">
                לא נמצאו גיבויים נוספים שייכים לחשבון שלך.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Auto-snapshots — rollback */}
      <div className="mt-3 border-t border-white/8 pt-3">
        <button
          type="button"
          onClick={toggleSnapshots}
          className="flex w-full items-center justify-between text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <RefreshCw className="size-3" />
            גלגול לאחור — גיבויים שנשמרו אוטומטית
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em]">
            {snapshotsOpen ? "סגור" : "פתח"}
          </span>
        </button>

        {snapshotsOpen ? (
          <div className="mt-3 flex flex-col gap-2">
            {snapshotsLoading ? (
              <div className="text-[11px] text-muted-foreground">סורק…</div>
            ) : snapshots && snapshots.length > 0 ? (
              snapshots.map((s, idx) => {
                const isRecommended = idx === 0 && s.richness > 0;
                return (
                  <div
                    key={s.capturedAt}
                    className={`flex items-center gap-2 rounded-2xl border p-3 ${
                      isRecommended
                        ? "border-[#34D399]/40 bg-[#34D399]/8"
                        : "border-white/8 bg-background/30"
                    }`}
                  >
                    <div className="flex-1 text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-foreground">
                          {reasonLabel(s.reason)}
                        </span>
                        {isRecommended ? (
                          <span className="rounded-full bg-[#34D399]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#34D399]">
                            מומלץ
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.richness} פריטים · {fmtTime(s.capturedAt)}
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => restoreSnapshot(s.capturedAt)}
                      disabled={busy}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        isRecommended
                          ? "border-[#34D399]/50 bg-[#34D399]/15 text-[#34D399]"
                          : "border-white/12 bg-background/40 text-foreground/80"
                      }`}
                    >
                      שחזר
                    </motion.button>
                  </div>
                );
              })
            ) : (
              <div className="text-[11px] text-muted-foreground">
                אין עדיין גיבויים אוטומטיים. הם נוצרים לפני התחברות / שחזור.
              </div>
            )}
          </div>
        ) : null}
      </div>
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
