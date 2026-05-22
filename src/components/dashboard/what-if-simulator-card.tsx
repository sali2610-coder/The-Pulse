"use client";

// What-if simulator. Single slider for "cut variable spend by N%",
// plus optional extra-income / extra-outflow toggles. Shows EOM
// forecast delta in real time. Auto-hides when there's no
// baseline forecast worth simulating (no anchors + no income +
// no obligations).

import { useMemo, useState } from "react";
import { Sliders } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { simulateForecast } from "@/lib/what-if";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function WhatIfSimulatorCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const [cutPct, setCutPct] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);
  const [extraOutflow, setExtraOutflow] = useState(0);

  const result = useMemo(() => {
    if (!hydrated) return null;
    return simulateForecast({
      accounts,
      loans,
      incomes,
      rules,
      entries,
      statuses,
      monthKey: currentMonthKey(),
      overrides: {
        variableSpendCut: cutPct / 100,
        extraIncome,
        extraOutflow,
      },
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    entries,
    statuses,
    cutPct,
    extraIncome,
    extraOutflow,
  ]);

  if (!hydrated || !result) return null;
  const base = result.baseline;
  if (
    base.totalAnchors === 0 &&
    base.expectedIncome === 0 &&
    base.futureCardSlices === 0
  ) {
    return null;
  }

  const better = result.delta > 0;
  const tone = result.delta === 0 ? "#A1A1AA" : better ? "#34D399" : "#F87171";

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sliders className="size-3 text-[color:var(--neon)]" />
          סימולציה
        </span>
        <button
          type="button"
          onClick={() => {
            setCutPct(0);
            setExtraIncome(0);
            setExtraOutflow(0);
          }}
          className="rounded-full border border-white/10 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="איפוס סימולציה"
        >
          איפוס
        </button>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            תחזית מקורית
          </span>
          <span data-mono="true" dir="ltr" className="text-[13px] text-muted-foreground">
            {ILS.format(base.forecast)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            לאחר שינוי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold"
            style={{ color: tone }}
          >
            {ILS.format(result.simulated.forecast)}
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[11px]"
        style={{ color: tone }}
      >
        <span>שינוי תחזית</span>
        <span data-mono="true" dir="ltr">
          {result.delta > 0 ? "+" : ""}
          {ILS.format(result.delta)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cut-slider"
          className="flex items-center justify-between text-[11px] text-muted-foreground"
        >
          <span>קיצוץ הוצאות משתנות עתידיות</span>
          <span dir="ltr" data-mono="true">
            {cutPct}%
          </span>
        </label>
        <input
          id="cut-slider"
          type="range"
          min={0}
          max={100}
          step={5}
          value={cutPct}
          onChange={(e) => setCutPct(Number(e.target.value))}
          aria-label="אחוז קיצוץ הוצאות משתנות"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[color:var(--neon)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>הכנסה נוספת</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={extraIncome || ""}
            placeholder="0"
            onChange={(e) =>
              setExtraIncome(Math.max(0, Number(e.target.value) || 0))
            }
            aria-label="הכנסה נוספת היפותטית"
            dir="ltr"
            data-mono="true"
            className="h-9 rounded-2xl border border-white/8 bg-black/30 px-2 text-[13px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span>הוצאה חד-פעמית</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={extraOutflow || ""}
            placeholder="0"
            onChange={(e) =>
              setExtraOutflow(Math.max(0, Number(e.target.value) || 0))
            }
            aria-label="הוצאה חד-פעמית היפותטית"
            dir="ltr"
            data-mono="true"
            className="h-9 rounded-2xl border border-white/8 bg-black/30 px-2 text-[13px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
          />
        </label>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        סימולציה בלבד — לא משנה את הנתונים. השינוי מתייחס לסוף החודש הנוכחי.
      </p>
    </section>
  );
}
