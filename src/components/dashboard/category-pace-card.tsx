"use client";

// Per-category spend pace. Shows the top 5 categories with biggest
// projected end-of-month total, signed delta vs prior 3-month
// median. Auto-hides when no category has any spend this month.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Gauge } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { categoryPace } from "@/lib/category-pace";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function CategoryPaceCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return categoryPace({
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries]);

  if (!hydrated) return null;
  const meaningful = rows
    .filter((r) => r.spentSoFar > 0 || r.priorMedian > 0)
    .slice(0, 5);
  if (meaningful.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Gauge className="size-3 text-[color:var(--neon)]" />
          קצב לפי קטגוריה
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          תחזית מול ממוצע 3 חודשים
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {meaningful.map((r, idx) => {
          const cat = getCategory(r.category);
          const up = r.deltaVsPrior > 0;
          const flat = Math.abs(r.deltaVsPrior) < r.priorMedian * 0.1;
          const tone = flat ? "#A1A1AA" : up ? "#F87171" : "#34D399";
          return (
            <motion.li
              key={r.category}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.22,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5 text-[11px]"
            >
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span style={{ color: cat.accent }} className="text-[12px]">
                  {cat.label}
                </span>
                <span
                  className="text-[10px] text-muted-foreground"
                  dir="ltr"
                  data-mono="true"
                >
                  עד כה {ILS.format(r.spentSoFar)} · תחזית{" "}
                  {ILS.format(r.projectedEOM)}
                </span>
              </div>
              <div
                className="flex items-center gap-1 text-[11px]"
                style={{ color: tone }}
                dir="ltr"
                data-mono="true"
              >
                {flat ? null : up ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {up ? "+" : ""}
                {ILS.format(Math.abs(r.deltaVsPrior))}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        תחזית סוף-חודש = הוצאה עד היום × ימי החודש ÷ היום הנוכחי.
      </p>
    </section>
  );
}
