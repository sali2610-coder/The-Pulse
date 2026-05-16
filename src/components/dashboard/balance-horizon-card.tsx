"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Compass } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { forecastBalanceChain, type ChainMonth } from "@/lib/forecast";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", { month: "short" });

const MONTHS_AHEAD = 6;
const WIDTH = 320;
const HEIGHT = 96;
const PAD_X = 12;

function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function BalanceHorizonCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const hasBank = accounts.some(
    (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
  );

  const chain = useMemo<ChainMonth[]>(() => {
    if (!hydrated || !hasBank) return [];
    return forecastBalanceChain({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      fromMonthKey: currentMonthKey(),
      months: MONTHS_AHEAD,
    });
  }, [hydrated, hasBank, accounts, loans, incomes, entries, rules, statuses]);

  const spark = useMemo(() => {
    if (chain.length === 0) return null;
    const start = chain[0].startBalance;
    const values = [start, ...chain.map((c) => c.endBalance)];
    const minV = Math.min(...values, 0);
    const maxV = Math.max(...values, 0);
    const range = Math.max(1, maxV - minV);
    const usableW = WIDTH - PAD_X * 2;
    const usableH = HEIGHT - 16;
    const stepX = usableW / (values.length - 1 || 1);
    const xFor = (i: number) => PAD_X + i * stepX;
    const yFor = (v: number) => 8 + ((maxV - v) / range) * usableH;
    const points = values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${path} L${points[points.length - 1].x} ${HEIGHT} L${points[0].x} ${HEIGHT} Z`;
    return {
      points,
      path,
      areaPath,
      zeroY: yFor(0),
      minV,
    };
  }, [chain]);

  if (!hydrated || !hasBank || chain.length === 0 || !spark) return null;

  const startBalance = chain[0].startBalance;
  const endBalance = chain[chain.length - 1].endBalance;
  const firstNegative = chain.find((c) => c.goesNegative);
  const accent =
    endBalance < startBalance ? (firstNegative ? "#F87171" : "#D4AF37") : "#34D399";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22, duration: 0.4 }}
      className="glass-card relative overflow-hidden rounded-3xl p-5"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${accent}55`,
      }}
    >
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ background: `${accent}1f`, color: accent }}
          >
            <Compass className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              אופק יתרה · {MONTHS_AHEAD} חודשים
            </span>
            <span className="text-base font-semibold text-foreground">
              <span dir="ltr" data-mono="true">
                {ILS.format(endBalance)}
              </span>{" "}
              בסוף האופק
            </span>
          </div>
        </div>
        {firstNegative && (
          <span className="flex items-center gap-1 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 px-2 py-1 text-[10px] font-medium text-[#F87171]">
            <AlertTriangle className="h-3 w-3" />
            חריגה ב־{MONTH_LABEL.format(monthKeyToDate(firstNegative.monthKey))}
          </span>
        )}
      </header>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 h-[96px] w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="horizon-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {spark.minV < 0 && (
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

        <motion.path
          d={spark.areaPath}
          fill="url(#horizon-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        />

        <motion.path
          d={spark.path}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.25, duration: 0.8, ease: "easeOut" }}
        />

        {spark.points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill={accent}
            opacity={0.85}
          />
        ))}
      </svg>

      <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>היום</span>
        <span dir="ltr">
          {chain
            .map((c) => MONTH_LABEL.format(monthKeyToDate(c.monthKey)))
            .join(" · ")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            עכשיו
          </span>
          <span
            dir="ltr"
            data-mono="true"
            className="text-sm font-semibold text-foreground"
          >
            {ILS.format(startBalance)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-black/25 px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            בעוד {MONTHS_AHEAD} חודשים
          </span>
          <span
            dir="ltr"
            data-mono="true"
            className="text-sm font-semibold"
            style={{ color: accent }}
          >
            {ILS.format(endBalance)}
          </span>
        </div>
      </div>
    </motion.section>
  );
}
