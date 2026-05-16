"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { categoryTotals, sliceForMonth } from "@/lib/projections";
import { currentMonthKey } from "@/lib/dates";
import { CATEGORIES, type CategoryId } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CategoryDonut() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const data = useMemo(() => {
    if (!hydrated) return { slices: [], total: 0 };
    const monthKey = currentMonthKey();
    // Only count entries with a slice this month, and exclude user-side pending.
    const livedEntries = entries.filter((e) => {
      if (e.needsConfirmation) return false;
      return sliceForMonth(e, monthKey) !== null;
    });
    const totals = categoryTotals({
      entries: livedEntries,
      monthKey,
    });
    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    const slices = CATEGORIES.map((c) => ({
      id: c.id as CategoryId,
      label: c.label,
      accent: c.accent,
      amount: totals.get(c.id) ?? 0,
    }))
      .filter((s) => s.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { slices, total };
  }, [hydrated, entries]);

  // Pre-compute the dasharray offset for each slice.
  const arcs = useMemo(() => {
    if (data.total <= 0) return [];
    let acc = 0;
    return data.slices.map((s) => {
      const portion = s.amount / data.total;
      const length = portion * CIRCUMFERENCE;
      const arc = {
        ...s,
        length,
        offset: acc,
        portion,
      };
      acc += length;
      return arc;
    });
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground/90">
          פילוח לפי קטגוריה
        </h3>
        <span className="text-xs text-muted-foreground">החודש</span>
      </header>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {/* Track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE}
              fill="none"
            />
            {arcs.map((a, idx) => (
              <motion.circle
                key={a.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={a.accent}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="butt"
                initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
                animate={{
                  strokeDasharray: `${a.length} ${CIRCUMFERENCE - a.length}`,
                  strokeDashoffset: -a.offset,
                }}
                transition={{
                  delay: 0.15 + idx * 0.05,
                  duration: 0.7,
                  ease: "easeOut",
                }}
                style={{
                  transform: `rotate(-90deg)`,
                  transformOrigin: "center",
                }}
              />
            ))}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              סך הכל
            </span>
            <span
              dir="ltr"
              className="font-mono text-xl font-semibold text-foreground"
            >
              {ILS.format(data.total)}
            </span>
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-1.5">
          {data.slices.slice(0, 5).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-2 text-foreground/85">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.accent }}
                />
                {s.label}
              </span>
              <span dir="ltr" className="font-mono text-foreground/70">
                {ILS.format(s.amount)}
              </span>
            </li>
          ))}
          {data.slices.length === 0 && (
            <li className="text-xs text-muted-foreground">
              אין עדיין הוצאות החודש.
            </li>
          )}
        </ul>
      </div>
    </motion.div>
  );
}
