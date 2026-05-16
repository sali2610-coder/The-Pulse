"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { dayOfWeekSpend } from "@/lib/forecast";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function DayOfWeekHeatmap() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const points = useMemo(() => {
    if (!hydrated) return [];
    return dayOfWeekSpend({
      entries,
      monthKey: currentMonthKey(),
      monthsBack: 3,
    });
  }, [hydrated, entries]);

  if (!hydrated || points.every((p) => p.total === 0)) return null;

  const max = Math.max(1, ...points.map((p) => p.total));
  const total = points.reduce((a, p) => a + p.total, 0);
  const peak = points.reduce((a, p) => (p.total > a.total ? p : a), points[0]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            תבנית שבועית · 3 חודשים
          </span>
          <span className="text-base font-semibold text-foreground">
            יום השיא: {DAY_LABELS[peak.dayOfWeek]} ·{" "}
            <span dir="ltr" className="font-mono">
              {ILS.format(peak.total)}
            </span>
          </span>
        </div>
      </header>

      {/* RTL day grid: Sun → Sat reads right-to-left in Hebrew week order */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-7 gap-1.5">
          {points.map((p, idx) => {
            const intensity = p.total / max;
            const bg =
              p.total === 0
                ? "rgba(255,255,255,0.05)"
                : `color-mix(in oklab, var(--neon) ${Math.round(18 + intensity * 72)}%, transparent)`;
            return (
              <motion.button
                key={p.dayOfWeek}
                type="button"
                tabIndex={-1}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.18 + idx * 0.04,
                  type: "spring",
                  stiffness: 240,
                  damping: 22,
                }}
                whileTap={{ scale: 0.94 }}
                className="flex aspect-square flex-col items-center justify-center rounded-xl text-[10px]"
                style={{ background: bg }}
                title={`${DAY_LABELS[p.dayOfWeek]} · ${ILS.format(p.total)} (${p.count} חיובים)`}
              >
                <span className="text-foreground/85">
                  {DAY_LABELS[p.dayOfWeek]}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>שקט</span>
          <div className="flex gap-1">
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((v) => (
              <span
                key={v}
                className="h-2 w-4 rounded-sm"
                style={{
                  background: `color-mix(in oklab, var(--neon) ${Math.round(18 + v * 72)}%, transparent)`,
                }}
              />
            ))}
          </div>
          <span>סוער</span>
        </div>
      </div>

      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>סך הכל בחלון</span>
        <span dir="ltr" data-mono="true" className="text-foreground">
          {ILS.format(total)}
        </span>
      </div>
    </motion.section>
  );
}
