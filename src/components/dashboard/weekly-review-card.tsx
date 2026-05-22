"use client";

// 7-day review surface. Compares this rolling week to the prior
// rolling week. Auto-hides when there is nothing in either window
// (fresh install, no spend at all). Lives in the "תובנות חכמות"
// section.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { weeklyReview } from "@/lib/weekly-review";
import { getCategory } from "@/lib/categories";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

export function WeeklyReviewCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const review = useMemo(() => {
    if (!hydrated) return null;
    return weeklyReview({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !review) return null;
  if (review.spentThisWeek === 0 && review.spentPriorWeek === 0) return null;

  const grew = review.delta > 0;
  const tone =
    review.delta === 0
      ? "#A1A1AA"
      : grew
        ? "#F87171"
        : "#34D399";

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3 text-[color:var(--neon)]" />
          סיכום השבוע
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {review.chargesThisWeek} חיובים
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            השבוע
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[20px] font-semibold text-foreground"
          >
            {ILS.format(review.spentThisWeek)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            שבוע שעבר
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {ILS.format(review.spentPriorWeek)}
          </span>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 rounded-2xl border border-white/8 bg-black/25 px-3 py-2"
        style={{ color: tone }}
      >
        {grew ? (
          <ArrowUpRight className="size-3.5" />
        ) : review.delta < 0 ? (
          <ArrowDownRight className="size-3.5" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        <span className="text-[12px]" data-mono="true" dir="ltr">
          {grew ? "+" : ""}
          {ILS.format(Math.abs(review.delta))} ({fmtPct(review.deltaPct)})
        </span>
        <span className="ms-auto text-[10px] text-muted-foreground">
          {grew ? "מעל השבוע הקודם" : review.delta < 0 ? "מתחת לשבוע הקודם" : "ללא שינוי"}
        </span>
      </div>

      {review.topMovers.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            השינויים הגדולים
          </div>
          <ul className="flex flex-col gap-1">
            {review.topMovers.map((m, idx) => {
              const cat = getCategory(m.category);
              const up = m.delta > 0;
              return (
                <motion.li
                  key={m.category}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: idx * STAGGER_TIGHT,
                    duration: 0.25,
                    ease: EASE_OUT_EXPO,
                  }}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-[11px]"
                >
                  <span className="flex items-center gap-1.5">
                    <span style={{ color: cat.accent }}>{cat.label}</span>
                  </span>
                  <span
                    className="flex items-center gap-1"
                    style={{ color: up ? "#F87171" : "#34D399" }}
                    data-mono="true"
                    dir="ltr"
                  >
                    {up ? "+" : ""}
                    {ILS.format(Math.abs(m.delta))}
                    <span className="text-[10px] text-muted-foreground">
                      {fmtPct(m.deltaPct)}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {review.biggestCharge ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="size-3 text-gold" />
            חיוב גדול
          </span>
          <span
            className="text-foreground"
            data-mono="true"
            dir="ltr"
          >
            {review.biggestCharge.merchant ?? "—"} ·{" "}
            {ILS.format(review.biggestCharge.amount)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
