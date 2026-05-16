"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { sliceForMonth } from "@/lib/projections";
import { categoryMonthlySeries } from "@/lib/forecast";
import { getCategory, type CategoryId } from "@/lib/categories";
import type { MonthKey } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryId;
  monthKey: MonthKey;
};

const MONTH_LABEL_SHORT = new Intl.DateTimeFormat("he-IL", { month: "short" });
const SPARK_W = 280;
const SPARK_H = 64;
const SPARK_PAD = 8;

function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function CategoryDrilldownSheet({
  open,
  onOpenChange,
  category,
  monthKey,
}: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const meta = getCategory(category);

  const series = useMemo(
    () =>
      categoryMonthlySeries({
        entries,
        category,
        monthKey,
        monthsBack: 6,
      }),
    [entries, category, monthKey],
  );

  const spark = useMemo(() => {
    const max = Math.max(1, ...series.map((p) => p.total));
    const usableW = SPARK_W - SPARK_PAD * 2;
    const usableH = SPARK_H - 14;
    const stepX = usableW / Math.max(1, series.length - 1);
    const xFor = (i: number) => SPARK_PAD + i * stepX;
    const yFor = (v: number) => 7 + ((max - v) / max) * usableH;
    const points = series.map((p, i) => ({
      x: xFor(i),
      y: yFor(p.total),
      total: p.total,
      monthKey: p.monthKey,
    }));
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${path} L${points[points.length - 1].x} ${SPARK_H} L${points[0].x} ${SPARK_H} Z`;
    return { points, path, areaPath };
  }, [series]);

  const thisMonth = series[series.length - 1]?.total ?? 0;
  const priorMonths = series.slice(0, -1).filter((p) => p.total > 0);
  const priorAvg =
    priorMonths.length > 0
      ? priorMonths.reduce((a, b) => a + b.total, 0) / priorMonths.length
      : 0;
  const delta = thisMonth - priorAvg;
  const deltaPct = priorAvg > 0 ? (delta / priorAvg) * 100 : null;

  const rows = useMemo(() => {
    type Row = {
      id: string;
      merchant: string;
      sliceAmount: number;
      chargeDate: Date;
      installments: number;
      source: string;
    };
    const list: Row[] = [];
    for (const entry of entries) {
      if (entry.category !== category) continue;
      if (entry.needsConfirmation) continue;
      if (entry.bankPending) continue;
      const slice = sliceForMonth(entry, monthKey);
      if (!slice) continue;
      list.push({
        id: entry.id,
        merchant: entry.merchant?.trim() || "עסק לא ידוע",
        sliceAmount: slice.amount,
        chargeDate: slice.chargeDate,
        installments: entry.installments,
        source: entry.source,
      });
    }
    list.sort((a, b) => b.chargeDate.getTime() - a.chargeDate.getTime());
    return list;
  }, [entries, category, monthKey]);

  const total = rows.reduce((a, b) => a + b.sliceAmount, 0);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${meta.label} — פירוט החודש`}
    >
      <header className="flex items-center gap-3 pt-1">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${meta.accent}22`, color: meta.accent }}
        >
          <meta.icon className="h-6 w-6" strokeWidth={1.6} />
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            פירוט קטגוריה
          </span>
          <h2 className="text-lg font-semibold text-foreground">
            {meta.label}
          </h2>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            סך הכל
          </span>
          <span
            dir="ltr"
            className="font-mono text-lg font-semibold text-foreground"
          >
            {ILS.format(total)}
          </span>
        </div>
      </header>

      {/* 6-month sparkline + trend vs prior-month average */}
      <section
        className="flex flex-col gap-2 rounded-2xl border p-3"
        style={{
          background: `${meta.accent}0d`,
          borderColor: `${meta.accent}26`,
        }}
      >
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.2em]">6 חודשים</span>
          {deltaPct !== null && (
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color: delta >= 0 ? "#F87171" : "#34D399" }}
            >
              {delta >= 0 ? (
                <TrendingUp className="h-3 w-3" strokeWidth={2} />
              ) : (
                <TrendingDown className="h-3 w-3" strokeWidth={2} />
              )}
              {delta >= 0 ? "+" : "−"}
              {Math.abs(Math.round(deltaPct))}% מול ממוצע
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="h-[64px] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cat-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={meta.accent} stopOpacity="0.32" />
              <stop offset="100%" stopColor={meta.accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={spark.areaPath}
            fill="url(#cat-area)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          />
          <motion.path
            d={spark.path}
            fill="none"
            stroke={meta.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.1, duration: 0.7, ease: "easeOut" }}
          />
          {spark.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === spark.points.length - 1 ? 3 : 2}
              fill={meta.accent}
              opacity={i === spark.points.length - 1 ? 1 : 0.55}
            />
          ))}
        </svg>

        <div
          dir="ltr"
          className="flex justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          {series.map((p) => (
            <span key={p.monthKey}>
              {MONTH_LABEL_SHORT.format(monthKeyToDate(p.monthKey))}
            </span>
          ))}
        </div>
      </section>

      <ul className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {rows.map((row, idx) => (
            <motion.li
              key={row.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ delay: idx * 0.015 }}
              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface/50 p-3"
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="line-clamp-1 text-sm font-medium text-foreground">
                  {row.merchant}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{DATE_FMT.format(row.chargeDate)}</span>
                  {row.installments > 1 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        תשלום {row.installments > 1 ? `1/${row.installments}` : ""}
                      </span>
                    </>
                  )}
                  {row.source === "wallet" && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>Wallet</span>
                    </>
                  )}
                </span>
              </div>
              <span
                dir="ltr"
                className="font-mono text-sm font-semibold text-foreground"
              >
                {ILS.format(row.sliceAmount)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <li className="rounded-2xl border border-white/8 bg-surface/40 p-4 text-center text-sm text-muted-foreground">
            עדיין אין חיובים בקטגוריה הזו החודש.
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
