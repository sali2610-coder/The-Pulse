"use client";

// Income-source breakdown. Shows monthly total income + per-source
// share bar. Refund credit folded in as a synthetic source so
// the user sees the FULL inflow picture, not just scheduled
// salary. Auto-hides when there's no income to break down.
//
// Phase 312 — each non-refund source is now a tappable card. Tap
// opens a quick edit BottomSheet wired straight to the store.
//
// Phase 316 — dual amount model:
//   expected = income.amount (immutable baseline — drives forecast)
//   actual   = income.actualByMonth[currentMonthKey] ?? expected
// The editor surfaces an "actual received" input that writes ONLY
// to actualByMonth via setIncomeActual; the expected baseline is
// never overwritten so month-over-month comparisons stay stable.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Pencil,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { incomeBreakdown } from "@/lib/income-breakdown";
import { currentMonthKey } from "@/lib/dates";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import type { Income } from "@/types/finance";

import { formatCurrencyAmount } from "@/lib/money";
const ILS = { format: (v: number) => formatCurrencyAmount(v) };

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

function nextDateFor(dayOfMonth: number, now: Date): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (candidate.getTime() < now.getTime()) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

function actualFor(income: Income, monthKey: string): number {
  const override = income.actualByMonth?.[monthKey];
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return income.amount;
}

function varianceTone(ratio: number): string {
  if (ratio >= 1) return "#34D399";
  if (ratio >= 0.8) return "#D4AF37";
  return "#F87171";
}

export function IncomeBreakdownCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const [editingId, setEditingId] = useState<string | null>(null);

  const monthKey = currentMonthKey();

  const breakdown = useMemo(() => {
    if (!hydrated) return null;
    return incomeBreakdown({ incomes, entries, monthKey });
  }, [hydrated, incomes, entries, monthKey]);

  if (!hydrated || !breakdown) return null;
  if (breakdown.totalMonthly === 0) return null;

  const editing = incomes.find((i) => i.id === editingId) ?? null;

  return (
    <>
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Banknote className="size-3 text-[color:var(--neon)]" />
            מקורות הכנסה
          </span>
          <span
            className="text-[10px] font-semibold text-[#34D399]"
            dir="ltr"
            data-mono="true"
          >
            {ILS.format(breakdown.totalMonthly)} / חודש
          </span>
        </header>

        <ul className="flex flex-col gap-2">
          {breakdown.sources.map((s, idx) => {
            const pct = Math.round(s.share * 100);
            const incomeRecord = incomes.find((i) => i.id === s.id);
            const nextDate =
              incomeRecord && !s.isRefund
                ? nextDateFor(incomeRecord.dayOfMonth, new Date())
                : null;
            const tappable = Boolean(incomeRecord && !s.isRefund);

            if (!tappable || !incomeRecord) {
              // Refund synthetic source — read-only tile.
              const tone = "#D4AF37";
              return (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: idx * STAGGER_TIGHT,
                    duration: 0.25,
                    ease: EASE_OUT_EXPO,
                  }}
                >
                  <div
                    className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3"
                    aria-label={`${s.label}: ${ILS.format(s.amount)}`}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${tone}22`, color: tone }}
                    >
                      <Sparkles className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[12.5px] font-medium text-foreground">
                        {s.label}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground/85">
                        זיכויים · {pct}% מההכנסה
                      </span>
                    </div>
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="text-[13px] font-semibold"
                      style={{ color: tone }}
                    >
                      +{ILS.format(s.amount)}
                    </span>
                  </div>
                </motion.li>
              );
            }

            const expected = incomeRecord.amount;
            const actual = actualFor(incomeRecord, monthKey);
            const ratio = expected > 0 ? actual / expected : 0;
            const ratioPct = Math.round(ratio * 100);
            const diff = actual - expected;
            const tone = varianceTone(ratio);
            const progressWidth = Math.min(100, Math.max(0, ratioPct));

            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: idx * STAGGER_TIGHT,
                  duration: 0.25,
                  ease: EASE_OUT_EXPO,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setEditingId(s.id);
                  }}
                  aria-label={`ערוך ${s.label}: צפוי ${ILS.format(expected)}, בפועל ${ILS.format(actual)}`}
                  className="flex w-full items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 text-start transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
                >
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${tone}22`, color: tone }}
                  >
                    <Wallet className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-foreground">
                        {s.label}
                      </span>
                      <span
                        data-mono="true"
                        dir="ltr"
                        className="shrink-0 text-[10.5px] text-muted-foreground/80"
                      >
                        {ILS.format(expected)} צפוי
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10.5px] text-muted-foreground/85">
                        {nextDate ? `כניסה צפויה ${DAY_FMT.format(nextDate)}` : ""}
                        {" · "}
                        {pct}% מההכנסה
                      </span>
                      <span
                        data-mono="true"
                        dir="ltr"
                        className="shrink-0 text-[11px] font-semibold"
                        style={{ color: tone }}
                      >
                        בפועל {ILS.format(actual)}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.max(progressWidth, 4)}%`,
                          background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span style={{ color: tone }} data-mono="true" dir="ltr">
                        {ratioPct}% התקבל
                      </span>
                      <span
                        className="text-muted-foreground/70"
                        data-mono="true"
                        dir="ltr"
                      >
                        {diff === 0
                          ? "ללא פער"
                          : diff > 0
                            ? `+${ILS.format(diff)} מעבר לצפוי`
                            : `${ILS.format(diff)} מתחת לצפוי`}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end leading-tight">
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted-foreground/70">
                      ערוך
                      <Pencil className="size-2.5" />
                    </span>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </section>

      <IncomeEditorSheet
        // Phase 340 — keying on the active income + monthKey causes
        // the sheet to remount with fresh state when either changes;
        // the editor's local draftActual then reads from useState
        // lazy-init and no effect-driven sync is needed.
        key={`${editing?.id ?? "none"}|${monthKey}`}
        open={editing !== null}
        income={editing}
        monthKey={monthKey}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
      />
    </>
  );
}

function IncomeEditorSheet({
  open,
  income,
  monthKey,
  onOpenChange,
}: {
  open: boolean;
  income: Income | null;
  monthKey: string;
  onOpenChange: (open: boolean) => void;
}) {
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);
  // Phase 340 — lazy initial state. The parent remounts the sheet
  // (key={income.id|monthKey}) so a fresh income / month boot reads
  // the right baseline once; no setState-in-effect dance.
  const [draftActual, setDraftActual] = useState<string>(() =>
    income ? String(Math.round(actualFor(income, monthKey))) : "",
  );

  if (!income) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="ערוך הכנסה">
        <div />
      </BottomSheet>
    );
  }

  const expected = income.amount;
  const actual = actualFor(income, monthKey);
  const ratio = expected > 0 ? actual / expected : 0;
  const tone = varianceTone(ratio);
  const diff = actual - expected;

  function commit() {
    if (!income) return;
    const nextActual = Number(draftActual.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(nextActual) && nextActual >= 0) {
      // null on equal-to-expected leaves the row clean; any other
      // positive value records the override for this month only.
      setIncomeActual(
        income.id,
        monthKey,
        nextActual === expected ? null : nextActual,
      );
      hapticSuccess();
    }
    onOpenChange(false);
  }

  function resetActual() {
    if (!income) return;
    setIncomeActual(income.id, monthKey, null);
    setDraftActual(String(Math.round(expected)));
    hapticTap();
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`עריכת ${income.label}`}
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#34D399]/15 text-[#34D399]">
            <Wallet className="size-4" />
          </span>
          <span className="text-section text-foreground">{income.label}</span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-[0.2em] ${
            income.active ? "text-[#34D399]" : "text-muted-foreground"
          }`}
        >
          {income.active ? "פעיל" : "כבוי"}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="צפוי"
          value={`+${ILS.format(expected)}`}
          tone="#60A5FA"
        />
        <Stat
          label="בפועל"
          value={`+${ILS.format(actual)}`}
          tone={tone}
        />
        <Stat
          label="פער"
          value={
            diff === 0
              ? "0"
              : diff > 0
                ? `+${ILS.format(diff)}`
                : ILS.format(diff)
          }
          tone={tone}
        />
      </div>

      <label className="flex flex-col gap-1 text-caption text-muted-foreground">
        <span>סכום שהתקבל בפועל</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={draftActual}
          onChange={(e) => setDraftActual(e.target.value)}
          dir="ltr"
          data-mono="true"
          className="h-10 rounded-2xl border border-white/8 bg-black/30 px-3 text-body text-foreground outline-none focus:border-[color:var(--neon)]/60"
        />
        <span className="text-[10.5px] text-muted-foreground/75">
          הסכום הצפוי נשמר קבוע לצורך מעקב והשוואה חודשית.
        </span>
      </label>

      <button
        type="button"
        onClick={resetActual}
        className="self-start text-[11px] text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
      >
        אפס לחודש זה (החזר לצפוי)
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onOpenChange(false);
          }}
          className="flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-caption text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={commit}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#34D399]/20 px-3 py-2 text-caption font-medium text-[#34D399] shadow-[inset_0_0_0_1px_#34D39966] transition-colors hover:bg-[#34D399]/30"
        >
          <CheckCircle2 className="size-3.5" />
          שמור
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          hapticTap();
          onOpenChange(false);
        }}
        className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground"
      >
        סגור
        <ArrowLeft className="size-3" />
      </button>
    </BottomSheet>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
