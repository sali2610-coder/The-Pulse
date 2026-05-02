"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Clock } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { pendingRulesForMonth } from "@/lib/projections";
import { getCategory } from "@/lib/categories";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

const dayFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

export function UpcomingExpenses() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const items = useMemo(() => {
    if (!hydrated) return [];
    return pendingRulesForMonth({
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, statuses]);

  if (!hydrated || items.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="rounded-2xl border border-border/60 bg-surface/50 p-4 backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">צפי החודש</h2>
        <span className="text-[11px] text-muted-foreground">
          {items.length} הוצאות קבועות
        </span>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map(({ rule, status, expectedDate }) => {
            const cat = getCategory(rule.category);
            const Icon = cat.icon;
            const paid = status?.status === "paid";
            const actualAmount = status?.actualAmount;
            return (
              <motion.li
                key={rule.id}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5"
              >
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60"
                  style={{ color: cat.accent }}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-foreground">
                      {rule.label}
                    </span>
                    {paid ? (
                      <CheckCircle2 className="size-3.5 text-gold" />
                    ) : (
                      <Clock className="size-3.5 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {dayFormatter.format(expectedDate)}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    data-mono="true"
                    className={`text-sm ${paid ? "text-gold" : "text-foreground"}`}
                    style={{ direction: "ltr" }}
                  >
                    {formatILS(actualAmount ?? rule.estimatedAmount)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {paid ? "שולם" : "צפוי"}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
