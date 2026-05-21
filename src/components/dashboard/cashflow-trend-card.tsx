"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { cashflowTrend } from "@/lib/cashflow-trend";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const HEBREW_MONTH_SHORT = [
  "ינו",
  "פבר",
  "מרץ",
  "אפר",
  "מאי",
  "יונ",
  "יול",
  "אוג",
  "ספט",
  "אוק",
  "נוב",
  "דצמ",
];

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return `${HEBREW_MONTH_SHORT[m - 1]}׳${String(y).slice(-2)}`;
}

/**
 * 6-month net cashflow + savings-rate trend. Renders nothing when
 * the user has zero active income (the math collapses) or no
 * expense history yet.
 *
 * The SVG sparkline draws each month as a bar — green above zero,
 * red below — so swings between surplus + deficit are obvious at
 * a glance. Headline number is the current month's net.
 */
export function CashflowTrendCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const incomes = useFinanceStore((s) => s.incomes);

  const trend = useMemo(() => {
    if (!hydrated) return null;
    return cashflowTrend({
      entries,
      incomes,
      monthKey: currentMonthKey(),
      lookback: 6,
    });
  }, [hydrated, entries, incomes]);

  if (!hydrated || !trend) return null;
  const months = trend.months;
  if (months.length === 0) return null;
  const totalIncome = months[months.length - 1].income;
  if (totalIncome === 0) return null;
  const hasExpenseHistory = months.some((m) => m.expense > 0);
  if (!hasExpenseHistory) return null;

  const current = months[months.length - 1];
  const isPositive = current.net >= 0;
  const tone = isPositive ? "#34D399" : "#F87171";
  const Icon = isPositive ? TrendingUp : TrendingDown;

  // Compute sparkline geometry.
  const max = Math.max(...months.map((m) => Math.abs(m.net)), 1);
  const W = 280;
  const H = 56;
  const barWidth = W / months.length;
  const midY = H / 2;

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}22`, color: tone }}
          >
            <Icon className="size-4" strokeWidth={1.8} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              תזרים נטו
            </span>
            <span className="text-[12.5px] font-medium text-foreground">
              הכנסה פחות הוצאה — 6 חודשים
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[15px] font-semibold"
            style={{ color: tone }}
          >
            {isPositive ? "+" : "−"}
            {ILS.format(Math.abs(current.net))}
          </span>
          {current.savingsRate !== null ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: `${tone}22`, color: tone }}
              dir="ltr"
            >
              {Math.round(current.savingsRate * 100)}% חיסכון
            </span>
          ) : null}
        </div>
      </header>

      <motion.svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-14 w-full"
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          x2={W}
          y1={midY}
          y2={midY}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="2 4"
        />
        {months.map((m, i) => {
          const ratio = m.net / max; // -1..1
          const barHeight = Math.abs(ratio) * (H / 2 - 4);
          const y = ratio >= 0 ? midY - barHeight : midY;
          const fill = ratio >= 0 ? "#34D39999" : "#F8717199";
          return (
            <rect
              key={m.monthKey}
              x={i * barWidth + 2}
              y={y}
              width={barWidth - 4}
              height={Math.max(2, barHeight)}
              rx={2}
              fill={fill}
            />
          );
        })}
      </motion.svg>

      <div className="grid grid-cols-6 gap-1 text-center">
        {months.map((m) => (
          <span
            key={m.monthKey}
            className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
            dir="ltr"
          >
            {monthLabel(m.monthKey)}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
        <span data-mono="true" dir="ltr">
          ממוצע נטו: {trend.averageNet >= 0 ? "+" : "−"}
          {ILS.format(Math.abs(trend.averageNet))}
        </span>
        {trend.bestMonth ? (
          <span data-mono="true" dir="ltr">
            שיא: {monthLabel(trend.bestMonth.monthKey)} ·{" "}
            {ILS.format(trend.bestMonth.net)}
          </span>
        ) : null}
      </div>
    </section>
  );
}
