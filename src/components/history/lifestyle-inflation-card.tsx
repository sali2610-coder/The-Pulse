"use client";

// Lifestyle-inflation lens. Different from yoy single-month +
// MonthOverMonth — a rolling 3-month average smooths the noise
// of any single bad month so slow-burn habit drift surfaces.
// Auto-hides when both windows are zero.

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Flame } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { lifestyleInflationReport } from "@/lib/lifestyle-inflation";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

const TONE = {
  deflation: "#34D399",
  stable: "#A1A1AA",
  drift: "#D4AF37",
  inflation: "#F87171",
} as const;

const LABEL = {
  deflation: "ירידה",
  stable: "יציב",
  drift: "סחיפה",
  inflation: "אינפלציה",
} as const;

export function LifestyleInflationCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const r = useMemo(() => {
    if (!hydrated) return null;
    return lifestyleInflationReport({
      entries,
      endMonth: currentMonthKey(),
    });
  }, [hydrated, entries]);

  if (!hydrated || !r) return null;
  if (r.recentAvg === 0 && r.priorAvg === 0) return null;

  const tone = TONE[r.trend];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Flame className="size-3 text-[color:var(--neon)]" />
          סחיפת חיים · 3 חודשים
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${tone}22`, color: tone }}
        >
          {LABEL[r.trend]}
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ממוצע חודשי עכשיו
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold text-foreground"
          >
            {ILS.format(r.recentAvg)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            שנה קודם
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {ILS.format(r.priorAvg)}
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[11px]"
        style={{ color: tone }}
        dir="ltr"
        data-mono="true"
      >
        <span className="flex items-center gap-1">
          {r.delta > 0 ? (
            <ArrowUpRight className="size-3" />
          ) : r.delta < 0 ? (
            <ArrowDownRight className="size-3" />
          ) : null}
          {r.delta > 0 ? "+" : ""}
          {ILS.format(r.delta)}
        </span>
        <span>{fmtPct(r.deltaPct)}</span>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        ממוצע 3 חודשים אחרונים מול אותו חלון לפני שנה. מחליק רעש של חודש בודד.
      </p>
    </section>
  );
}
