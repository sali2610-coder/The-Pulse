"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  Banknote,
  CreditCard,
  Layers,
  Receipt,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";

// Manual sign-prepending instead of `signDisplay: "always"` — the latter
// throws RangeError on iOS Safari < 15.4 when Intl.NumberFormat is
// constructed at module load, taking the whole card with it.
const _ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const formatILS = (value: number) => _ils.format(value);
const formatILSSign = (value: number) => {
  if (value === 0) return _ils.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${_ils.format(Math.abs(value))}`;
};

export function CfoSummary() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  // Read from the single financial snapshot so every card on the dashboard
  // agrees on the same numbers. Previously CFO ran its own
  // forecastEndOfMonth which produced subtly different totals.
  const snap = useMemo(() => {
    if (!hydrated) return null;
    return buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

  const hasAnchors = accounts.some(
    (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
  );

  if (!hydrated) return null;

  if (!hasAnchors) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-5 backdrop-blur-md">
        <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          CFO Brain
        </div>
        <div className="mt-2 text-sm text-foreground">
          הוסף לפחות חשבון בנק אחד עם anchor כדי לקבל תחזית סוף חודש מלאה.
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          הגדרות → חשבונות → חשבון בנק → קבע יתרה נוכחית.
        </div>
      </section>
    );
  }

  if (!snap) return null;

  // Project the same line the rest of the dashboard uses — net cash on
  // the 1st of next month BEFORE applying the discretionary spending
  // budget. CFO has always been "where is my money if I behave?" — the
  // dedicated CashflowSummaryCard above already applies the budget.
  const forecast = snap.projectedBalanceWithoutDiscretionary;
  const isRed = forecast < 0;
  const accent = isRed ? "#F87171" : "#34D399";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-2xl"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -40px ${accent}55`,
      }}
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            />
            CFO Brain · End of month
          </div>
          <motion.div
            key={Math.round(forecast)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            data-mono="true"
            className="mt-2 text-3xl font-light tracking-tight"
            style={{ direction: "ltr", color: accent }}
          >
            {formatILSSign(forecast)}
          </motion.div>
          <div className="text-xs text-muted-foreground">
            {isRed ? "סיום חודש בחריגה" : "סיום חודש בעודף"}
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2.5 text-[11px]">
        <BreakdownRow
          icon={<Wallet className="size-3.5" />}
          label="יתרה נוכחית"
          value={formatILSSign(snap.currentBalance)}
          tone={snap.currentBalance >= 0 ? "positive" : "negative"}
        />
        <BreakdownRow
          icon={<ArrowDownToLine className="size-3.5" />}
          label="הכנסות צפויות"
          value={formatILSSign(snap.expectedIncomeUntilNextMonth)}
          tone="positive"
        />
        <BreakdownRow
          icon={<Receipt className="size-3.5" />}
          label="הוצאות קבועות"
          value={`−${formatILS(snap.fixedExpensesUntilNextMonth)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<Banknote className="size-3.5" />}
          label="הלוואות"
          value={`−${formatILS(snap.activeLoansPaymentsUntilNextMonth)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<CreditCard className="size-3.5" />}
          label="תשלומים"
          value={`−${formatILS(snap.installmentPaymentsUntilNextMonth)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<Layers className="size-3.5" />}
          label="חיובי כרטיס עתידיים"
          value={`−${formatILS(snap.recurringCommitmentsUntilNextMonth)}`}
          tone="negative"
        />
      </div>
    </motion.section>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "#34D399"
      : tone === "negative"
        ? "#F87171"
        : "#A8A8A8";
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        style={{ direction: "ltr", color }}
        className="font-medium"
      >
        {value}
      </span>
    </div>
  );
}
