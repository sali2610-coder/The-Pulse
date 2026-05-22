"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import {
  captureSafetyBackup,
  listRecoverableSnapshots,
  listSafetyBackups,
  readLastRestoreResult,
  recordRestoreResult,
  richness,
  summarizePayload,
  verifyRestore,
  type RestoreResult,
  type SafetyPayload,
  type SafetySnapshot,
} from "@/lib/local-safety-snapshots";
import { readLastBlockedReason } from "@/lib/remote-state-sync";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { tap, success } from "@/lib/haptics";
import {
  clearErrors,
  listErrors,
  type LoggedError,
} from "@/lib/error-log";

const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function fmtTime(ts: number): string {
  try {
    return TIME_FMT.format(new Date(ts));
  } catch {
    return "—";
  }
}

function localPayload(): SafetyPayload {
  const s = useFinanceStore.getState();
  return {
    entries: s.entries,
    rules: s.rules,
    statuses: s.statuses,
    accounts: s.accounts,
    loans: s.loans,
    incomes: s.incomes,
    monthlyBudget: s.monthlyBudget,
    lastSyncedAt: s.lastSyncedAt,
    audioEnabled: s.audioEnabled,
  };
}

type Session = { user?: { id?: string; email?: string } } | null;

/**
 * Diagnostic panel mounted inside the unified BackupsCard advanced
 * drawer. Surfaces every piece of state the user needs to debug a
 * data-loss incident without contacting support: identity, device,
 * local entity counts, local safety snapshots with restore action,
 * last blocked overwrite reason.
 *
 * Restore here applies the safety snapshot's payload directly to
 * the Zustand store via setState — bypasses remote-state-sync so a
 * subsequent network round-trip can't undo the recovery.
 */
export function SafetyDiagnostics() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [snapshots, setSnapshots] = useState<SafetySnapshot[]>([]);
  const [session, setSession] = useState<Session>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<RestoreResult | null>(null);
  const [errors, setErrors] = useState<LoggedError[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setDeviceId(getOrCreateDeviceId());
      setSnapshots(listSafetyBackups());
      setBlockedReason(readLastBlockedReason());
      setLastRestore(readLastRestoreResult());
      setErrors(listErrors());
      void fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setSession(j as Session);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) return null;

  const localRichness = richness({
    entries: entries.length,
    rules: rules.length,
    accounts: accounts.length,
    loans: loans.length,
    incomes: incomes.length,
    monthlyBudget,
  });

  function refresh() {
    setSnapshots(listSafetyBackups());
    setBlockedReason(readLastBlockedReason());
    setLastRestore(readLastRestoreResult());
  }

  const recoverable = listRecoverableSnapshots();
  const richest = recoverable[0] ?? null;
  const storageScope = session?.user?.id
    ? `user:${session.user.id.slice(0, 8)}`
    : `device:${deviceId.slice(0, 10)}`;

  function manualCapture() {
    tap();
    captureSafetyBackup("manual", localPayload());
    success();
    toast.success("גיבוי בטיחות מקומי נשמר");
    refresh();
  }

  function restoreSnap(snap: SafetySnapshot) {
    tap();
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `לשחזר גיבוי בטיחות מ־${fmtTime(snap.capturedAt)}? פריטים: ${snap.counts.richness}.`,
      )
    ) {
      return;
    }
    // Capture the current live state so restore is reversible.
    const livePayload = localPayload();
    const liveBefore = summarizePayload(livePayload);
    captureSafetyBackup("pre-restore", livePayload);

    const api = useFinanceStore.setState as (
      partial: Partial<ReturnType<typeof useFinanceStore.getState>>,
    ) => void;
    api({
      entries: snap.payload.entries,
      rules: snap.payload.rules,
      statuses: snap.payload.statuses,
      accounts: snap.payload.accounts,
      loans: snap.payload.loans,
      incomes: snap.payload.incomes,
      monthlyBudget: snap.payload.monthlyBudget,
      lastSyncedAt: snap.payload.lastSyncedAt,
      audioEnabled: snap.payload.audioEnabled,
    });

    // Verify counts in the live store match the snapshot. If not,
    // rollback to pre-restore and surface the mismatch.
    const liveAfter = summarizePayload(localPayload());
    const verify = verifyRestore({
      expected: snap.counts,
      actual: liveAfter,
    });
    if (!verify.ok) {
      api({
        entries: livePayload.entries,
        rules: livePayload.rules,
        statuses: livePayload.statuses,
        accounts: livePayload.accounts,
        loans: livePayload.loans,
        incomes: livePayload.incomes,
        monthlyBudget: livePayload.monthlyBudget,
        lastSyncedAt: livePayload.lastSyncedAt,
        audioEnabled: livePayload.audioEnabled,
      });
      recordRestoreResult({
        at: Date.now(),
        source: "local-safety",
        ok: false,
        reason: verify.mismatch,
        beforeRichness: liveBefore.richness,
        expectedRichness: snap.counts.richness,
        afterRichness: liveAfter.richness,
        rolledBack: true,
      });
      toast.error(`השחזור נכשל: ${verify.mismatch}. המצב הקודם הוחזר.`);
      refresh();
      return;
    }

    recordRestoreResult({
      at: Date.now(),
      source: "local-safety",
      ok: true,
      beforeRichness: liveBefore.richness,
      expectedRichness: snap.counts.richness,
      afterRichness: liveAfter.richness,
    });
    success();
    toast.success("גיבוי בטיחות שוחזר");
    refresh();
  }

  return (
    <motion.div
      layout
      className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#F87171]/30 bg-[#F87171]/5 p-3"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#F87171]">
        <ShieldAlert className="size-3.5" />
        אבחון בטיחות נתונים
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
        <Dt label="חשבון מחובר">
          {session?.user?.email ?? "לא מחובר"}
        </Dt>
        <Dt label="מזהה משתמש">
          {session?.user?.id ? session.user.id.slice(0, 8) + "…" : "—"}
        </Dt>
        <Dt label="מזהה מכשיר">{deviceId.slice(0, 10) + "…"}</Dt>
        <Dt label="storage scope">{storageScope}</Dt>
        <Dt label="פריטים נוכחיים">{localRichness}</Dt>
        <Dt label="חיובים">{entries.length}</Dt>
        <Dt label="חשבונות">{accounts.length}</Dt>
        <Dt label="הלוואות">{loans.length}</Dt>
        <Dt label="קבועים">{rules.length}</Dt>
        <Dt label="הכנסות">{incomes.length}</Dt>
        <Dt label="גיבויי בטיחות">{snapshots.length}</Dt>
        <Dt label="גיבוי עשיר ביותר">
          {richest ? `${richest.counts.richness}` : "—"}
        </Dt>
      </dl>

      {richest && richest.counts.richness > localRichness ? (
        <div className="rounded-lg border border-[#34D399]/30 bg-[#34D399]/5 p-2 text-[10.5px] text-[#34D399]">
          <div className="font-medium">גיבוי עשיר יותר זמין</div>
          <div className="text-foreground/80">
            {richest.counts.richness} פריטים · {fmtTime(richest.capturedAt)} · {richest.reason}
          </div>
          <button
            type="button"
            onClick={() => restoreSnap(richest)}
            className="mt-1 rounded-md border border-[#34D399]/40 bg-[#34D399]/10 px-2 py-0.5 text-[10px] text-[#34D399] hover:bg-[#34D399]/20"
          >
            שחזר את הגיבוי העשיר ביותר
          </button>
        </div>
      ) : null}

      {lastRestore ? (
        <div
          className={`rounded-lg border p-2 text-[10px] ${
            lastRestore.ok
              ? "border-white/10 bg-black/30 text-muted-foreground"
              : "border-[#F87171]/30 bg-[#F87171]/5 text-destructive"
          }`}
        >
          <div className="font-medium">
            שחזור אחרון · {lastRestore.ok ? "הצליח" : "נכשל"}
          </div>
          <div dir="ltr" data-mono="true">
            {fmtTime(lastRestore.at)} · {lastRestore.source} · before={lastRestore.beforeRichness} → expected={lastRestore.expectedRichness} → after={lastRestore.afterRichness}
            {lastRestore.rolledBack ? " · ROLLED BACK" : ""}
          </div>
          {lastRestore.reason ? (
            <pre className="overflow-x-auto whitespace-pre-wrap" dir="ltr">
              {lastRestore.reason}
            </pre>
          ) : null}
        </div>
      ) : null}

      {blockedReason ? (
        <div className="rounded-lg border border-[#F87171]/30 bg-black/30 p-2 text-[10px] text-destructive">
          <div className="font-medium">דריסה אחרונה שנחסמה</div>
          <pre
            className="overflow-x-auto whitespace-pre-wrap"
            dir="ltr"
          >
            {blockedReason}
          </pre>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="rounded-lg border border-[#F87171]/30 bg-black/30 p-2 text-[10px]">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-destructive">
              שגיאות אחרונות · {errors.length}
            </span>
            <button
              type="button"
              onClick={() => {
                tap();
                clearErrors();
                setErrors([]);
              }}
              className="rounded-md border border-white/15 bg-background/40 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
            >
              נקה
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {errors.slice(0, 5).map((e) => (
              <li
                key={e.id}
                className="rounded border border-white/8 bg-black/40 p-1.5"
                dir="ltr"
                data-mono="true"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-destructive">
                    {e.source} · {fmtTime(e.at)}
                  </span>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[9.5px] text-foreground/85">
                  {e.message}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>גיבויים מקומיים אחרונים</span>
          <button
            type="button"
            onClick={manualCapture}
            className="rounded-md border border-[#F87171]/40 bg-[#F87171]/10 px-2 py-0.5 text-[10px] text-[#F87171] hover:bg-[#F87171]/20"
          >
            צלם עכשיו
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-[10px] text-muted-foreground/80">
            אין עדיין גיבויי בטיחות מקומיים.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshots.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-[10.5px]"
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-foreground">
                    {s.reason} · {s.counts.richness} פריטים
                  </span>
                  <span
                    className="text-[9px] text-muted-foreground"
                    dir="ltr"
                    data-mono="true"
                  >
                    {fmtTime(s.capturedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => restoreSnap(s)}
                  className="rounded-md border border-white/20 bg-background/40 px-2 py-0.5 text-[10px] text-foreground hover:border-white/40"
                >
                  שחזר
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function Dt({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0 leading-tight">
      <dt className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </dt>
      <dd className="text-[11px] text-foreground" dir="ltr" data-mono="true">
        {children}
      </dd>
    </div>
  );
}
