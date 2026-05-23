"use client";

// Year-over-year delta for the current month vs same month last
// year. Distinct from MonthOverMonth (sequential months) and
// YearlySummary (rolling 12-month total) — surfaces seasonality
// + habit drift. Auto-hides when both years are zero.

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, History } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { yoyReport } from "@/lib/yoy";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

export function YoyCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const r = useMemo(() => {
    if (!hydrated) return null;
    return yoyReport({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  if (!hydrated || !r) return null;
  if (r.thisYearTotal === 0 && r.lastYearTotal === 0) return null;

  const grew = r.delta > 0;
  const tone =
    r.delta === 0 ? "#A1A1AA" : grew ? "#F87171" : "#34D399";
  const Icon = grew
    ? ArrowUpRight
    : r.delta < 0
      ? ArrowDownRight
      : History;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <History className="size-3 text-[color:var(--neon)]" />
          שנה מול שנה
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {monthLabel(r.thisMonth)}
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            השנה
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[20px] font-semibold text-foreground"
          >
            {ILS.format(r.thisYearTotal)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            שנה שעברה
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {ILS.format(r.lastYearTotal)}
          </span>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[12px]"
        style={{ color: tone }}
        dir="ltr"
        data-mono="true"
      >
        <Icon className="size-3.5" />
        {grew ? "+" : ""}
        {ILS.format(Math.abs(r.delta))} ({fmtPct(r.deltaPct)})
      </div>

      {r.topMovers.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {r.topMovers.map((m) => {
            const cat = getCategory(m.category);
            const up = m.delta > 0;
            return (
              <li
                key={m.category}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-[11px]"
              >
                <span style={{ color: cat.accent }}>{cat.label}</span>
                <span
                  data-mono="true"
                  dir="ltr"
                  style={{ color: up ? "#F87171" : "#34D399" }}
                >
                  {up ? "+" : ""}
                  {ILS.format(Math.abs(m.delta))}{" "}
                  <span className="text-[10px] text-muted-foreground">
                    {fmtPct(m.deltaPct)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
