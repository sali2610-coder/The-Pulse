"use client";

// Phase 381 — DailyAllowance card now reads buildDailyBudgetView.
// The card flips into a DEFICIT state when the 10th-of-next-month
// anchor forecast is negative; positive states keep the
// per-day-pro-rated reading.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Coins, AlertTriangle } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildDailyBudgetView } from "@/lib/daily-budget-view";
import { AnimatedCounter } from "@/components/ui/animated-counter";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function DailyAllowance() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const data = useMemo(() => {
    if (!hydrated) return null;
    return buildDailyBudgetView({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  if (!data) return null;

  if (data.state === "deficit") {
    // Negative-budget surface — show the real deficit, not "₪0".
    const updatedDeficit = data.deficit + Math.max(0, data.spentToday);
    return (
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-4 backdrop-blur-md"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(248,113,113,0.16)", color: "#F87171" }}
        >
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-red-300/85">
              {data.spentToday > 0
                ? "החריגה המעודכנת"
                : "התקציב שלך כבר במינוס"}
            </span>
            <span
              data-mono="true"
              className="text-xl"
              style={{ direction: "ltr", color: "#F87171" }}
            >
              −
              <AnimatedCounter value={updatedDeficit} format={formatILS} />
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-red-200/75">
            <span>
              {data.spentToday > 0
                ? `היום הוצאת ${formatILS(data.spentToday)} נוספים`
                : "כל הוצאה נוספת מגדילה את החריגה"}
            </span>
            <span>עד ה-10 לחודש הבא</span>
          </div>
        </div>
      </motion.section>
    );
  }

  // Positive flow — per-day allowance.
  const allowance = Math.max(0, data.perDay - Math.max(0, data.spentToday));
  const overspentToday =
    data.spentToday > data.perDay && data.perDay > 0;
  const allowanceColor = overspentToday ? "#F87171" : "#D4AF37";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/50 p-4 backdrop-blur-md"
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `${allowanceColor}1a`,
          color: allowanceColor,
        }}
      >
        <Coins className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">מותר היום</span>
          <span
            data-mono="true"
            className="text-xl"
            style={{ direction: "ltr", color: allowanceColor }}
          >
            <AnimatedCounter value={allowance} format={formatILS} />
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {data.anchorOffset === 1
              ? "יום אחד אחרון"
              : `${data.anchorOffset} ימים עד ה-10`}
          </span>
          <span>נוצל היום {formatILS(data.spentToday)}</span>
        </div>
      </div>
    </motion.section>
  );
}
