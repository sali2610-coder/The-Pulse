"use client";

// Income-source breakdown. Shows monthly total income + per-source
// share bar. Refund credit folded in as a synthetic source so
// the user sees the FULL inflow picture, not just scheduled
// salary. Auto-hides when there's no income to break down.
//
// Phase 312 — each non-refund source is now a tappable card. Tap
// opens a quick edit BottomSheet wired straight to the store
// (updateIncome). Updates flow into the canonical incomes table,
// so liquidity / forecast / health all react live to the change.
//
// "Monthly override" semantics (apply only this month) are NOT
// implemented yet — they need a per-month overrides table that
// every consumer (snapshot / forecast / liquidity) reads. The
// editor exposes "amount + day + active" against the base record
// for now and surfaces a note explaining the scope.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  Pencil,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { incomeBreakdown } from "@/lib/income-breakdown";
import { currentMonthKey } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import type { Income } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

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

function actualInflowForIncome(
  args: { entries: ReturnType<typeof useFinanceStore.getState>["entries"]; monthKey: string },
): number {
  // Refunds posted this month feed back into the user's wallet —
  // they're the closest proxy for "income that wasn't the planned
  // salary". `incomeBreakdown` already exposes them as a synthetic
  // refund source; here we surface the per-month actual sum for
  // the editor's "צפוי / בפועל" line, scoped to refund entries.
  let n = 0;
  for (const e of args.entries) {
    if (!e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    n += slice.amount;
  }
  return n;
}

export function IncomeBreakdownCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const [editingId, setEditingId] = useState<string | null>(null);

  const breakdown = useMemo(() => {
    if (!hydrated) return null;
    return incomeBreakdown({
      incomes,
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, incomes, entries]);

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
            const tone = s.isRefund ? "#D4AF37" : "#34D399";
            const incomeRecord = incomes.find((i) => i.id === s.id);
            const nextDate =
              incomeRecord && !s.isRefund
                ? nextDateFor(incomeRecord.dayOfMonth, new Date())
                : null;
            const tappable = Boolean(incomeRecord && !s.isRefund);
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
                {tappable ? (
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap();
                      setEditingId(s.id);
                    }}
                    aria-label={`ערוך ${s.label}`}
                    className="flex w-full items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 text-start transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
                  >
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${tone}22`, color: tone }}
                    >
                      <Wallet className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[12.5px] font-medium text-foreground">
                        {s.label}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground/85">
                        משכורת קבועה ·{" "}
                        {nextDate ? `כניסה צפויה ${DAY_FMT.format(nextDate)}` : ""}
                        · {pct}% מההכנסה
                      </span>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(pct, 4)}%`,
                            background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end leading-tight">
                      <span
                        data-mono="true"
                        dir="ltr"
                        className="text-[13px] font-semibold"
                        style={{ color: tone }}
                      >
                        +{ILS.format(s.amount)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted-foreground/70">
                        ערוך
                        <Pencil className="size-2.5" />
                      </span>
                    </div>
                  </button>
                ) : (
                  // Refund synthetic source — not editable, just a tile.
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
                )}
              </motion.li>
            );
          })}
        </ul>
      </section>

      <IncomeEditorSheet
        open={editing !== null}
        income={editing}
        actualRefund={actualInflowForIncome({
          entries,
          monthKey: currentMonthKey(),
        })}
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
  actualRefund,
  onOpenChange,
}: {
  open: boolean;
  income: Income | null;
  actualRefund: number;
  onOpenChange: (open: boolean) => void;
}) {
  const updateIncome = useFinanceStore((s) => s.updateIncome);
  const [draftAmount, setDraftAmount] = useState<string>("");
  const [draftDay, setDraftDay] = useState<string>("");

  // Re-seed drafts whenever a new income is opened.
  const reseed = (i: Income | null) => {
    if (!i) return;
    setDraftAmount(String(Math.round(i.amount)));
    setDraftDay(String(i.dayOfMonth));
  };

  // Sync drafts with the currently-open income.
  // Pure derived state — no setState in effect.
  useMemo(() => reseed(income), [income]);

  if (!income) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="ערוך הכנסה">
        <div />
      </BottomSheet>
    );
  }

  const expected = income.amount;
  const actual = expected + actualRefund;

  function commit() {
    if (!income) return;
    const nextAmount = Number(draftAmount.replace(/[^\d.-]/g, ""));
    const nextDay = Number(draftDay.replace(/[^\d]/g, ""));
    const patch: { amount?: number; dayOfMonth?: number } = {};
    if (Number.isFinite(nextAmount) && nextAmount >= 0) {
      patch.amount = nextAmount;
    }
    if (Number.isFinite(nextDay) && nextDay >= 1 && nextDay <= 31) {
      patch.dayOfMonth = nextDay;
    }
    if (Object.keys(patch).length > 0) {
      updateIncome(income.id, patch);
      hapticSuccess();
    }
    onOpenChange(false);
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

      <p className="text-caption text-muted-foreground">
        עדכון כאן משנה את ההכנסה הקבועה בכל החודשים. אם תרצה רק חודש
        אחד יוצא דופן, הוסף הוצאה/זיכוי ידני באותו תאריך.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="צפוי"
          value={`+${ILS.format(Math.round(expected))}`}
          tone="#60A5FA"
        />
        <Stat
          label="בפועל החודש"
          value={`+${ILS.format(Math.round(actual))}`}
          tone={actual >= expected ? "#34D399" : "#F87171"}
        />
      </div>

      <label className="flex flex-col gap-1 text-caption text-muted-foreground">
        <span>סכום קבוע</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          dir="ltr"
          data-mono="true"
          className="h-10 rounded-2xl border border-white/8 bg-black/30 px-3 text-body text-foreground outline-none focus:border-[color:var(--neon)]/60"
        />
      </label>

      <label className="flex flex-col gap-1 text-caption text-muted-foreground">
        <span>יום בחודש</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={draftDay}
          onChange={(e) => setDraftDay(e.target.value)}
          dir="ltr"
          data-mono="true"
          className="h-10 rounded-2xl border border-white/8 bg-black/30 px-3 text-body text-foreground outline-none focus:border-[color:var(--neon)]/60"
        />
      </label>

      <section className="rounded-2xl border border-white/8 bg-black/25 p-3">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Calendar className="size-3.5" />
          <span>שינוי חד-פעמי לחודש הזה?</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          לכיסוי משכורת מוקדמת / מאוחרת / חלקית: סגור כאן והוסף עסקה
          ידנית עם תיוג &quot;הכנסה&quot; בתאריך המתאים. החודשים העתידיים
          לא ישתנו.
        </p>
      </section>

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
