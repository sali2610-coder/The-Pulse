"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { categoryTrends } from "@/lib/forecast";
import { getCategory } from "@/lib/categories";
import type { CategoryId } from "@/lib/categories";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function CategoryTrendsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const trends = useMemo(() => {
    if (!hydrated) return [];
    return categoryTrends({
      entries,
      monthKey: currentMonthKey(),
      lookback: 3,
    }).slice(0, 6);
  }, [hydrated, entries]);

  if (trends.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border/50 bg-surface/30 p-6 text-center">
        <div className="text-sm text-muted-foreground">
          אין נתונים להשוואה — צריכים לפחות חודש קודם
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          מגמות קטגוריה
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          השוואה מול ממוצע 3 חודשים אחרונים
        </div>
      </header>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {trends.map((t) => {
            const cat = getCategory(t.category as CategoryId);
            const Icon = cat.icon;
            const direction =
              t.deltaPct === null
                ? "neutral"
                : t.deltaPct > 5
                  ? "up"
                  : t.deltaPct < -5
                    ? "down"
                    : "neutral";
            const dirColor =
              direction === "up"
                ? "#F87171"
                : direction === "down"
                  ? "#34D399"
                  : "#A8A8A8";
            const DirIcon =
              direction === "up"
                ? ArrowUpRight
                : direction === "down"
                  ? ArrowDownRight
                  : Minus;
            return (
              <motion.li
                key={t.category}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5"
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: cat.accent, background: `${cat.accent}10` }}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{cat.label}</span>
                    <span
                      data-mono="true"
                      className="text-sm text-foreground"
                      style={{ direction: "ltr" }}
                    >
                      {formatILS(t.thisMonth)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>ממוצע: {formatILS(t.priorAverage)}</span>
                    <span
                      className="flex items-center gap-1"
                      style={{ color: dirColor }}
                    >
                      <DirIcon className="size-3" />
                      {t.deltaPct === null
                        ? "—"
                        : `${t.deltaPct > 0 ? "+" : ""}${t.deltaPct.toFixed(0)}%`}
                    </span>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
