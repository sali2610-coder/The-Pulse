"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { categoryTotals } from "@/lib/projections";
import { CATEGORIES, getCategory } from "@/lib/categories";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function CategoryBreakdown() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const items = useMemo(() => {
    if (!hydrated) return [];
    const totals = categoryTotals({
      entries,
      monthKey: currentMonthKey(),
    });
    const max = Math.max(1, ...Array.from(totals.values()));
    return CATEGORIES.map((cat) => ({
      cat,
      total: totals.get(cat.id) ?? 0,
      pct: ((totals.get(cat.id) ?? 0) / max) * 100,
    }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [hydrated, entries]);

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border/50 bg-surface/30 p-6 text-center">
        <div className="text-sm text-muted-foreground">
          אין הוצאות בחודש הנוכחי
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          פירוט לפי קטגוריה
        </div>
      </header>
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map(({ cat, total, pct }) => {
            const Icon = getCategory(cat.id).icon;
            return (
              <motion.li
                key={cat.id}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-foreground">
                    <Icon className="size-4" style={{ color: cat.accent }} />
                    {cat.label}
                  </span>
                  <span
                    data-mono="true"
                    className="text-foreground"
                    style={{ direction: "ltr" }}
                  >
                    {formatILS(total)}
                  </span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                  <motion.div
                    animate={{ width: `${pct}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 22 }}
                    className="absolute inset-y-0 right-0 rounded-full"
                    style={{ background: cat.accent }}
                  />
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
