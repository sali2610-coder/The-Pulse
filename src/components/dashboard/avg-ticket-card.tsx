"use client";

// 6-month average-ticket-size trend. Different from
// CategoryTrends + MonthOverMonth — surfaces "are individual
// charges getting bigger" regardless of category. Sparkline of
// avg per-charge per month + signed delta vs prior baseline.
// Auto-hides on fully empty history.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Receipt } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { avgTicketTrend } from "@/lib/avg-ticket";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "short",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

const WIDTH = 320;
const HEIGHT = 64;
const PAD_X = 6;
const PAD_Y = 6;

export function AvgTicketCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return avgTicketTrend({
      entries,
      endMonth: currentMonthKey(),
      months: 6,
    });
  }, [hydrated, entries]);

  if (!hydrated || !report) return null;
  const meaningful = report.points.filter((p) => p.count > 0);
  if (meaningful.length === 0) return null;

  const max = Math.max(...report.points.map((p) => p.avg), 1);
  const min = Math.min(...report.points.map((p) => p.avg).filter((v) => v > 0), max);
  const span = max - min || 1;
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const step =
    report.points.length === 1 ? 0 : innerW / (report.points.length - 1);
  const dots = report.points.map((p, i) => ({
    x: PAD_X + step * i,
    y: PAD_Y + innerH * (1 - (Math.max(p.avg, min) - min) / span),
  }));
  const linePath = dots
    .map((pt, i) =>
      `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`,
    )
    .join(" ");

  const last = report.points[report.points.length - 1];
  const tone =
    report.trend === 0
      ? "#A1A1AA"
      : report.trend > 0
        ? "#F87171"
        : "#34D399";
  const TrendIcon =
    report.trend > 0
      ? ArrowUpRight
      : report.trend < 0
        ? ArrowDownRight
        : Receipt;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Receipt className="size-3 text-[color:var(--neon)]" />
          ממוצע חיוב · 6 חודשים
        </span>
        <span
          className="flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: tone }}
          dir="ltr"
          data-mono="true"
        >
          <TrendIcon className="size-3" />
          {report.trend > 0 ? "+" : ""}
          {ILS.format(report.trend)}
        </span>
      </header>

      <motion.svg
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        aria-label="גרף ממוצע חיוב לאורך 6 חודשים"
      >
        <path d={linePath} stroke={tone} strokeWidth={1.6} fill="none" />
        {dots.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === dots.length - 1 ? 3 : 1.5}
            fill={tone}
          />
        ))}
      </motion.svg>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {monthLabel(last.monthKey)}
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[16px] font-semibold text-foreground"
          >
            {ILS.format(last.avg)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            חיובים החודש
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {last.count}
          </span>
        </div>
      </div>
    </section>
  );
}
