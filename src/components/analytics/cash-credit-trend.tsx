"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Banknote, CreditCard } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { paymentMethodMonthlyTotals } from "@/lib/forecast";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", { month: "short" });

function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD_X = 12;

const CASH_COLOR = "#D4AF37";
const CREDIT_COLOR = "#00E5FF";

export function CashCreditTrend() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const series = useMemo(() => {
    if (!hydrated) return [];
    return paymentMethodMonthlyTotals({
      entries,
      monthKey: currentMonthKey(),
      monthsBack: 6,
    });
  }, [hydrated, entries]);

  const chart = useMemo(() => {
    if (series.length === 0) return null;
    const max = Math.max(
      1,
      ...series.flatMap((p) => [p.cash, p.credit]),
    );
    const usableW = WIDTH - PAD_X * 2;
    const usableH = HEIGHT - 18;
    const stepX = usableW / Math.max(1, series.length - 1);
    const xFor = (i: number) => PAD_X + i * stepX;
    const yFor = (v: number) => 8 + ((max - v) / max) * usableH;
    const cashPoints = series.map((p, i) => ({
      x: xFor(i),
      y: yFor(p.cash),
    }));
    const creditPoints = series.map((p, i) => ({
      x: xFor(i),
      y: yFor(p.credit),
    }));
    const toPath = (pts: { x: number; y: number }[]) =>
      pts
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
    return {
      cashPath: toPath(cashPoints),
      creditPath: toPath(creditPoints),
      cashPoints,
      creditPoints,
      max,
    };
  }, [series]);

  if (!hydrated || series.length === 0 || !chart) return null;

  const totals = series.reduce(
    (acc, p) => ({ cash: acc.cash + p.cash, credit: acc.credit + p.credit }),
    { cash: 0, credit: 0 },
  );
  const ratio = totals.cash + totals.credit;
  const cashShare = ratio > 0 ? (totals.cash / ratio) * 100 : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            מזומן מול אשראי · 6 חודשים
          </span>
          <span className="text-base font-semibold text-foreground">
            {Math.round(cashShare)}% מזומן ·{" "}
            {Math.round(100 - cashShare)}% אשראי
          </span>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[120px] w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="cash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CASH_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={CASH_COLOR} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="credit-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CREDIT_COLOR} stopOpacity="0.22" />
            <stop offset="100%" stopColor={CREDIT_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Credit area */}
        <motion.path
          d={`${chart.creditPath} L${chart.creditPoints[chart.creditPoints.length - 1].x} ${HEIGHT} L${chart.creditPoints[0].x} ${HEIGHT} Z`}
          fill="url(#credit-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        />
        {/* Cash area */}
        <motion.path
          d={`${chart.cashPath} L${chart.cashPoints[chart.cashPoints.length - 1].x} ${HEIGHT} L${chart.cashPoints[0].x} ${HEIGHT} Z`}
          fill="url(#cash-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        />

        {/* Credit stroke */}
        <motion.path
          d={chart.creditPath}
          fill="none"
          stroke={CREDIT_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }}
        />
        {/* Cash stroke */}
        <motion.path
          d={chart.cashPath}
          fill="none"
          stroke={CASH_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
        />

        {chart.cashPoints.map((p, i) => (
          <circle
            key={`c-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.2}
            fill={CASH_COLOR}
            opacity={0.85}
          />
        ))}
        {chart.creditPoints.map((p, i) => (
          <circle
            key={`r-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.2}
            fill={CREDIT_COLOR}
            opacity={0.9}
          />
        ))}
      </svg>

      <div
        dir="ltr"
        className="flex justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground"
      >
        {series.map((p) => (
          <span key={p.monthKey}>
            {MONTH_LABEL.format(monthKeyToDate(p.monthKey))}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2 text-foreground/85">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: `${CASH_COLOR}22`, color: CASH_COLOR }}
          >
            <Banknote className="h-3.5 w-3.5" strokeWidth={1.6} />
          </span>
          <span>
            מזומן{" "}
            <span dir="ltr" className="font-mono text-muted-foreground">
              {ILS.format(totals.cash)}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-foreground/85">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: `${CREDIT_COLOR}22`, color: CREDIT_COLOR }}
          >
            <CreditCard className="h-3.5 w-3.5" strokeWidth={1.6} />
          </span>
          <span>
            אשראי{" "}
            <span dir="ltr" className="font-mono text-muted-foreground">
              {ILS.format(totals.credit)}
            </span>
          </span>
        </span>
      </div>
    </motion.section>
  );
}
