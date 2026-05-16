"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  forecastBalanceTimeline,
  type BalanceTimeline,
} from "@/lib/forecast";
import { daysInMonth } from "@/lib/projections";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
// Manual sign prepending — `signDisplay: "always"` throws on iOS < 15.4
// and was crashing the entire card at module construction.
const ILS_SIGNED = {
  format(value: number): string {
    if (value === 0) return ILS.format(0);
    const sign = value > 0 ? "+" : "−";
    return `${sign}${ILS.format(Math.abs(value))}`;
  },
};

const WIDTH = 320;
const HEIGHT = 88;
const PAD_X = 8;

type SparkPoint = { x: number; y: number; balance: number; day: number };

/**
 * Daily balance trajectory for the rest of the month. Surfaces:
 *   - Start balance (today's anchor sum)
 *   - End-of-month projected balance
 *   - First day projected to go below 0 (overdraft warning)
 *   - Lowest projected day (when balance bottoms)
 */
export function BalanceForecastCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthKey = currentMonthKey();

  const hasBank = accounts.some(
    (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
  );

  const timeline = useMemo<BalanceTimeline | null>(() => {
    if (!hydrated || !hasBank) return null;
    return forecastBalanceTimeline({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey,
    });
  }, [
    hydrated,
    hasBank,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthKey,
  ]);

  const spark = useMemo(() => {
    if (!timeline || timeline.points.length === 0) return null;
    const totalDays = daysInMonth(monthKey);
    const minBalance = Math.min(timeline.startBalance, timeline.lowestBalance, 0);
    const maxBalance = Math.max(
      timeline.startBalance,
      ...timeline.points.map((p) => p.balance),
      0,
    );
    const range = Math.max(1, maxBalance - minBalance);
    const usableW = WIDTH - PAD_X * 2;
    const usableH = HEIGHT - 14;

    const xForDay = (day: number) =>
      PAD_X + ((day - 1) / Math.max(1, totalDays - 1)) * usableW;
    const yForBalance = (b: number) =>
      7 + ((maxBalance - b) / range) * usableH;

    const points: SparkPoint[] = timeline.points.map((p) => ({
      x: xForDay(p.day),
      y: yForBalance(p.balance),
      balance: p.balance,
      day: p.day,
    }));
    // Anchor pre-startDay region as a flat line at startBalance so the
    // sparkline visually starts from day 1.
    const head: SparkPoint = {
      x: xForDay(1),
      y: yForBalance(timeline.startBalance),
      balance: timeline.startBalance,
      day: 1,
    };
    if (timeline.startDay > 1) {
      const headEnd: SparkPoint = {
        x: xForDay(timeline.startDay - 1),
        y: yForBalance(timeline.startBalance),
        balance: timeline.startBalance,
        day: timeline.startDay - 1,
      };
      points.unshift(headEnd);
      points.unshift(head);
    }

    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    // Area path (sparkline → bottom of svg) for soft fill.
    const baselineY = yForBalance(Math.max(0, minBalance));
    const areaPath = `${path} L${points[points.length - 1].x.toFixed(1)} ${HEIGHT} L${points[0].x.toFixed(1)} ${HEIGHT} Z`;

    const overdraftX = timeline.overdraftDay
      ? xForDay(timeline.overdraftDay)
      : null;
    const zeroY = yForBalance(0);

    return {
      path,
      areaPath,
      points,
      overdraftX,
      overdraftDay: timeline.overdraftDay,
      zeroY,
      baselineY,
      minBalance,
      maxBalance,
    };
  }, [timeline, monthKey]);

  if (!hydrated) return null;
  if (!hasBank) return null;
  if (!timeline || !spark) return null;

  const trendUp = timeline.endBalance >= timeline.startBalance;
  const accent = timeline.goesNegative
    ? "#F87171"
    : trendUp
      ? "#34D399"
      : "#D4AF37";
  const deltaAbs = Math.abs(timeline.endBalance - timeline.startBalance);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.4 }}
      className="glass-card relative overflow-hidden rounded-3xl p-5"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${accent}55`,
      }}
    >
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            תחזית יתרה · החודש
          </span>
          <span
            dir="ltr"
            data-mono="true"
            className="text-2xl font-light tracking-tight text-foreground"
            style={{ color: accent }}
          >
            {ILS.format(timeline.endBalance)}
          </span>
          <span
            dir="ltr"
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            {trendUp ? (
              <TrendingUp className="h-3 w-3" style={{ color: accent }} />
            ) : (
              <TrendingDown className="h-3 w-3" style={{ color: accent }} />
            )}
            {ILS_SIGNED.format(timeline.endBalance - timeline.startBalance)} ·{" "}
            {deltaAbs > 0
              ? trendUp
                ? "צפוי להיכנס"
                : "צפוי להישחק"
              : "ללא שינוי"}
          </span>
        </div>

        {timeline.goesNegative && (
          <span className="flex items-center gap-1 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 px-2 py-1 text-[10px] font-medium text-[#F87171]">
            <AlertTriangle className="h-3 w-3" />
            חריגה צפויה
          </span>
        )}
      </header>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 h-[88px] w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="balance-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero baseline if visible in range */}
        {spark.minBalance < 0 && (
          <line
            x1={0}
            x2={WIDTH}
            y1={spark.zeroY}
            y2={spark.zeroY}
            stroke="rgba(248,113,113,0.35)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* Area */}
        <motion.path
          d={spark.areaPath}
          fill="url(#balance-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        />

        {/* Stroke */}
        <motion.path
          d={spark.path}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.15, duration: 0.8, ease: "easeOut" }}
        />

        {/* Overdraft marker */}
        {spark.overdraftX !== null && (
          <>
            <line
              x1={spark.overdraftX}
              x2={spark.overdraftX}
              y1={0}
              y2={HEIGHT}
              stroke="#F87171"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.55}
            />
            <circle
              cx={spark.overdraftX}
              cy={spark.zeroY}
              r={3.5}
              fill="#F87171"
            />
          </>
        )}
      </svg>

      {/* Footer stats */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="היום"
          value={ILS.format(timeline.startBalance)}
          tone={timeline.startBalance < 0 ? "negative" : "neutral"}
        />
        <Stat
          label={timeline.overdraftDay ? "חריגה מ־0" : "נקודת שפל"}
          value={
            timeline.overdraftDay
              ? `יום ${timeline.overdraftDay}`
              : ILS.format(timeline.lowestBalance)
          }
          tone={timeline.overdraftDay || timeline.lowestBalance < 0 ? "negative" : "neutral"}
        />
        <Stat
          label="סוף חודש"
          value={ILS.format(timeline.endBalance)}
          tone={timeline.endBalance < 0 ? "negative" : trendUp ? "positive" : "neutral"}
        />
      </div>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "#34D399"
      : tone === "negative"
        ? "#F87171"
        : "#E4E7EC";
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-black/25 px-2.5 py-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-xs font-semibold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
