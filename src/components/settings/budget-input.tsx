"use client";

// Phase 331 — Budget Control simplified.
//
// Old layout shipped a manual/auto toggle + breakdown table + draft
// preview. The user called it "מסך חשבונאי מפוצץ"; the math is
// meant to run silently. New layout keeps only the surface the user
// reads at a glance:
//
//   - Title
//   - One big number (available until next salary)
//   - Safety buffer slider
//   - One smart Hebrew sentence describing the trajectory
//
// All math still flows through buildBudgetControlBreakdown →
// AutoBudgetReport so the rest of the dashboard reads the same
// numbers in real time. The user's persisted budgetMode is left
// alone (Manual mode is still readable elsewhere); this surface
// itself is auto-only.

import { motion } from "framer-motion";
import { ShieldCheck, Target } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";
import { autoBudget } from "@/lib/auto-budget";
import { buildBudgetSentence } from "@/lib/budget-control";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { currentMonthKey } from "@/lib/dates";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";

import { formatCurrencyAmount } from "@/lib/money";
const ILS = { format: (v: number) => formatCurrencyAmount(v) };

export function BudgetInput() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const setBuffer = useFinanceStore((s) => s.setBudgetSafetyBuffer);

  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  if (!hydrated) return null;

  const report = autoBudget({
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    safetyBuffer: buffer,
  });
  const breakdown = report.breakdown;
  const snap = buildFinancialSnapshot({
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
    monthKey: currentMonthKey(),
  });
  const sentence = buildBudgetSentence({
    breakdown,
    projectedEndOfMonth: snap.projectedBalanceOnFirstOfNextMonth,
  });

  const negative = breakdown.available < 0;
  const missing = !breakdown.hasAnchors;
  const valueColor = missing
    ? "rgba(255,255,255,0.55)"
    : negative
      ? "#F87171"
      : "#34D399";
  const sign = breakdown.available > 0 ? "+" : breakdown.available < 0 ? "−" : "";
  const headline = missing
    ? "—"
    : `${sign}${ILS.format(Math.abs(breakdown.available))}`;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="flex items-center gap-2.5">
        <Target className="size-4 text-gold" />
        <div className="flex flex-col leading-tight">
          <span className="text-section text-foreground">בקרת תקציב אוטומטית</span>
          <span className="text-caption text-muted-foreground">
            המערכת מחשבת ברקע אחרי כל פעולה
          </span>
        </div>
      </header>

      <motion.div
        layout
        className="mt-4 flex items-baseline justify-between gap-3"
      >
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            עד המשכורת הבאה
          </span>
          <span className="text-[10.5px] text-muted-foreground/70">
            {missing ? "חסר מידע" : `${report.daysRemaining} ימים`}
          </span>
        </div>
        <motion.span
          key={headline}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          data-mono="true"
          dir="ltr"
          className="text-[28px] font-light"
          style={{ color: valueColor }}
        >
          {headline}
        </motion.span>
      </motion.div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85">
        {sentence}
      </p>

      <label className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12.5px] text-foreground">
            <ShieldCheck className="size-4 text-[color:var(--neon)]" />
            כרית ביטחון
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[12.5px] font-medium text-foreground"
          >
            {ILS.format(buffer)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={5000}
          step={50}
          value={buffer}
          onChange={(e) => {
            setBuffer(Number(e.target.value));
            void flushBudgetSettings();
          }}
          onPointerDown={() => tap()}
          className="w-full accent-[color:var(--neon)]"
          aria-label="כרית ביטחון"
        />
        <span className="text-[10.5px] text-muted-foreground/80">
          הסכום שיישאר בצד ולא ייכנס לחישוב התקציב הפנוי.
        </span>
      </label>
    </section>
  );
}
