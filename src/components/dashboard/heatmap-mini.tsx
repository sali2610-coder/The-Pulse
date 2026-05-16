"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { sliceForMonth, daysInMonth } from "@/lib/projections";
import { currentMonthKey, monthKeyOf } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type DayCell = { day: number; total: number; intensity: number; isFuture: boolean };

export function HeatmapMini() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const data = useMemo<{
    days: DayCell[];
    monthTotal: number;
    monthDays: number;
  }>(() => {
    if (!hydrated) return { days: [], monthTotal: 0, monthDays: 30 };
    const monthKey = currentMonthKey();
    const monthDays = daysInMonth(monthKey);
    const today = new Date();
    const todayMonth = monthKeyOf(today);
    const todayDay = todayMonth === monthKey ? today.getDate() : monthDays;

    const totals = new Array(monthDays).fill(0) as number[];
    for (const entry of entries) {
      if (entry.needsConfirmation) continue;
      const slice = sliceForMonth(entry, monthKey);
      if (!slice) continue;
      const d = slice.chargeDate.getDate();
      if (d >= 1 && d <= monthDays) {
        totals[d - 1] += slice.amount;
      }
    }
    const max = Math.max(...totals, 0);
    const monthTotal = totals.reduce((a, b) => a + b, 0);
    const days: DayCell[] = totals.map((total, i) => ({
      day: i + 1,
      total,
      intensity: max > 0 ? Math.min(1, total / max) : 0,
      isFuture: i + 1 > todayDay,
    }));
    return { days, monthTotal, monthDays };
  }, [hydrated, entries]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground/90">
          חום ימי החודש
        </h3>
        <span dir="ltr" className="font-mono text-xs text-muted-foreground">
          {ILS.format(data.monthTotal)}
        </span>
      </header>

      <div dir="ltr" className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => {
          const bg = d.isFuture
            ? "rgba(255,255,255,0.04)"
            : d.intensity === 0
              ? "rgba(255,255,255,0.05)"
              : `color-mix(in oklab, var(--neon) ${Math.round(
                  18 + d.intensity * 72,
                )}%, transparent)`;
          return (
            <motion.div
              key={d.day}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.18 + d.day * 0.008,
                type: "spring",
                stiffness: 280,
                damping: 22,
              }}
              className="relative flex aspect-square items-center justify-center rounded-md"
              style={{ background: bg }}
              title={`יום ${d.day} · ${ILS.format(d.total)}`}
            >
              <span className="text-[9px] font-medium text-foreground/70">
                {d.day}
              </span>
            </motion.div>
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
                background: `color-mix(in oklab, var(--neon) ${Math.round(
                  18 + v * 72,
                )}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>סוער</span>
      </div>
    </motion.div>
  );
}
