"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { dailyAllowance } from "@/lib/forecast";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function DailyAllowance() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const data = useMemo(() => {
    if (!hydrated) return null;
    return dailyAllowance({
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries, rules, statuses, monthlyBudget]);

  if (!data || monthlyBudget <= 0) return null;

  const overspentToday = data.spentToday > data.allowance && data.allowance > 0;
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
          <motion.span
            key={Math.round(data.allowance)}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            data-mono="true"
            className="text-xl"
            style={{ direction: "ltr", color: allowanceColor }}
          >
            {formatILS(data.allowance)}
          </motion.span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {data.daysRemaining === 1
              ? "היום האחרון בחודש"
              : `${data.daysRemaining} ימים נותרו`}
          </span>
          <span>נוצל היום {formatILS(data.spentToday)}</span>
        </div>
      </div>
    </motion.section>
  );
}
