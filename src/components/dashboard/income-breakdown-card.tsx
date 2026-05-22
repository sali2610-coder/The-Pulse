"use client";

// Income-source breakdown. Shows monthly total income + per-source
// share bar. Refund credit folded in as a synthetic source so
// the user sees the FULL inflow picture, not just scheduled
// salary. Auto-hides when there's no income to break down.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Banknote, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { incomeBreakdown } from "@/lib/income-breakdown";
import { currentMonthKey } from "@/lib/dates";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function IncomeBreakdownCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);

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

  return (
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

      <ul className="flex flex-col gap-1.5">
        {breakdown.sources.map((s, idx) => {
          const pct = Math.round(s.share * 100);
          const tone = s.isRefund ? "#D4AF37" : "#34D399";
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
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="w-24 shrink-0 truncate text-foreground">
                {s.isRefund ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3 text-gold" />
                    {s.label}
                  </span>
                ) : (
                  s.label
                )}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 start-0 rounded-full"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
                  }}
                />
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="w-20 shrink-0 text-end text-[11px] text-muted-foreground"
              >
                {ILS.format(s.amount)} · {pct}%
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
