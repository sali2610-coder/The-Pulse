"use client";

// Categorical Pareto card. "These N categories carry X% of the
// month". Stacked bar with one slice per dominant category +
// per-row chip. Distinct from CategoryBreakdown (full
// distribution); this card frames the insight rather than the
// raw chart.
//
// Auto-hides when monthly total is 0.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { categoryPareto } from "@/lib/category-pareto";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function CategoryParetoCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const r = useMemo(() => {
    if (!hydrated) return null;
    return categoryPareto({
      entries,
      monthKey: currentMonthKey(),
      threshold: 0.8,
    });
  }, [hydrated, entries]);

  if (!hydrated || !r || r.total === 0) return null;

  const sharePct = Math.round(r.headlineShare * 100);
  const otherShare = Math.max(0, 1 - r.headlineShare);
  const otherPct = Math.round(otherShare * 100);

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-gold" />
          {r.dominant.length} קטגוריות נושאות
        </span>
        <span
          dir="ltr"
          data-mono="true"
          className="text-[10px] font-semibold text-foreground"
        >
          {sharePct}% מהחודש
        </span>
      </header>

      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {r.dominant.map((row) => {
          const cat = getCategory(row.category);
          return (
            <motion.div
              key={row.category}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(1, row.share * 100)}%` }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: `linear-gradient(90deg, ${cat.accent}, ${cat.accent}66)`,
              }}
            />
          );
        })}
        {otherShare > 0 ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(1, otherShare * 100)}%` }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
        ) : null}
      </div>

      <ul className="flex flex-col gap-1">
        {r.dominant.map((row, idx) => {
          const cat = getCategory(row.category);
          return (
            <motion.li
              key={row.category}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.22,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{ background: cat.accent }}
                />
                <span style={{ color: cat.accent }}>{cat.label}</span>
              </span>
              <span
                data-mono="true"
                dir="ltr"
                className="text-muted-foreground"
              >
                {ILS.format(row.total)} · {Math.round(row.share * 100)}%
              </span>
            </motion.li>
          );
        })}
        {otherShare > 0 ? (
          <li className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full bg-white/15"
              />
              שאר הקטגוריות
            </span>
            <span data-mono="true" dir="ltr">
              {otherPct}%
            </span>
          </li>
        ) : null}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        80/20 — קצירת התובנה מהקטגוריות שבאמת מזיזות את החודש.
      </p>
    </section>
  );
}
