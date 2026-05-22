"use client";

// Rolling 12-month summary lives in the History tab — different
// cadence from MonthOverMonth (per-month deltas) and CategoryTrends
// (3-month moving baseline). Auto-hides on totally empty history.

import { useMemo } from "react";
import { CalendarDays, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { yearlySummary } from "@/lib/yearly-summary";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function YearlySummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const summary = useMemo(() => {
    if (!hydrated) return null;
    return yearlySummary({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !summary) return null;
  if (summary.totalSpent === 0 && summary.refundCredit === 0) return null;

  const cat = summary.topCategory
    ? getCategory(summary.topCategory.category)
    : null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3 text-[color:var(--neon)]" />
          12 חודשים אחרונים
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {summary.chargesCount} חיובים · {summary.monthsWithSpend} חודשים פעילים
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            סך הוצאה נטו
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold text-foreground"
          >
            {ILS.format(summary.netSpent)}
          </span>
          {summary.refundCredit > 0 ? (
            <span
              className="text-[10px] text-[#34D399]"
              data-mono="true"
              dir="ltr"
            >
              זיכויים +{ILS.format(summary.refundCredit)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ממוצע חודשי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold text-foreground"
          >
            {ILS.format(summary.monthlyAverage)}
          </span>
          <span
            className="text-[10px] text-muted-foreground"
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(summary.dailyAverage)} ליום
          </span>
        </div>
      </div>

      {cat && summary.topCategory ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="size-3 text-gold" />
            קטגוריה דומיננטית
          </span>
          <span className="flex items-center gap-2">
            <span style={{ color: cat.accent }}>{cat.label}</span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-foreground"
            >
              {ILS.format(summary.topCategory.total)}
            </span>
          </span>
        </div>
      ) : null}

      {summary.topMerchant ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="size-3 text-[color:var(--neon)]" />
            מקור הוצאה דומיננטי
          </span>
          <span className="flex items-center gap-2">
            <span className="text-foreground">{summary.topMerchant.merchant}</span>
            <span data-mono="true" dir="ltr" className="text-foreground">
              {ILS.format(summary.topMerchant.total)}
            </span>
          </span>
        </div>
      ) : null}
    </section>
  );
}
