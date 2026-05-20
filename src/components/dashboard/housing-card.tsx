"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Home, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildHousingBucket,
  HOUSING_SUBCAT_LABEL,
} from "@/lib/housing-bucket";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * Housing / living-cost surface. Aggregates every active recurring
 * rule that classifies into the housing bucket, sorted by subtotal.
 * Renders only when there's at least one classified rule — fresh
 * installs see the welcome card instead.
 */
export function HousingCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const incomes = useFinanceStore((s) => s.incomes);

  const bucket = useMemo(() => {
    if (!hydrated) return null;
    const totalIncome = incomes
      .filter((i) => i.active)
      .reduce((sum, i) => sum + i.amount, 0);
    return buildHousingBucket({
      rules,
      totalMonthlyIncome: totalIncome,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, incomes]);

  if (!hydrated || !bucket || bucket.rows.length === 0) return null;

  const sharePct =
    bucket.shareOfIncome !== undefined
      ? Math.round(bucket.shareOfIncome * 100)
      : null;
  const shareTone =
    sharePct === null
      ? "muted"
      : sharePct >= 45
        ? "warn"
        : sharePct >= 30
          ? "watch"
          : "calm";
  const shareClass =
    shareTone === "warn"
      ? "text-destructive"
      : shareTone === "watch"
        ? "text-gold"
        : shareTone === "calm"
          ? "text-[#34D399]"
          : "text-muted-foreground";

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col text-right leading-tight">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <Home className="size-3 text-gold" />
            סל דיור חודשי
          </div>
          <span className="text-[10px] text-muted-foreground/70">
            הוצאות קבועות סביב הבית
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-xl font-light text-foreground"
          >
            {ILS.format(bucket.totalMonthly)}
          </span>
          {sharePct !== null ? (
            <span className={`text-[10px] font-medium ${shareClass}`}>
              {sharePct}% מההכנסה
            </span>
          ) : null}
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        {bucket.rows.map((row, idx) => (
          <motion.li
            key={row.sub}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: idx * STAGGER_TIGHT,
              duration: 0.3,
              ease: EASE_OUT_EXPO,
            }}
            className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/25 px-3 py-2"
          >
            <div className="flex flex-col leading-tight">
              <span className="text-[12.5px] font-medium text-foreground">
                {HOUSING_SUBCAT_LABEL[row.sub]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {row.rules.length} {row.rules.length === 1 ? "חיוב" : "חיובים"}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[12.5px] font-semibold text-foreground/90"
            >
              {ILS.format(row.monthlyTotal)}
            </span>
          </motion.li>
        ))}
      </ul>

      {sharePct !== null && sharePct >= 35 ? (
        <p className="flex items-start gap-1.5 rounded-xl border border-gold/30 bg-gold/8 p-2 text-[11px] leading-relaxed text-foreground/90">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" />
          סל הדיור צורך כ-{sharePct}% מההכנסה החודשית — מעל הסף הבריא של 30%.
        </p>
      ) : null}
    </section>
  );
}
