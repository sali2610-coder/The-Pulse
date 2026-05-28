"use client";

// Phase 275 — CFO Sandbox.
//
// Promotes the old WhatIfSimulatorCard from a tiny home widget into
// a full simulation surface inside the AI Insights tab. Four levers
// the user can drag to rewrite the month's forecast:
//
//   • salary change  ( −50% .. +50% )
//   • recurring cut  (   0% .. 100% )
//   • variable cut   (   0% .. 100% )
//   • one-time bonus + one-time outflow inputs
//
// All math goes through the existing `simulateForecast` engine —
// the new fields (salaryChangePct, recurringCutPct) were added to
// WhatIfOverrides in the same phase. No engine logic forks here.
//
// Reads end-of-month forecast deltas and renders an AI-flavored
// conversational recommendation based on the resulting trajectory.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  HandCoins,
  Repeat,
  RotateCcw,
  Sliders,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { simulateForecast } from "@/lib/what-if";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtPct(x: number): string {
  return `${x > 0 ? "+" : ""}${Math.round(x)}%`;
}

export function CfoSandboxCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const [salaryPct, setSalaryPct] = useState(0);
  const [recurringCutPct, setRecurringCutPct] = useState(0);
  const [variableCutPct, setVariableCutPct] = useState(0);
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
        salaryChangePct: salaryPct / 100,
        recurringCutPct: recurringCutPct / 100,
        variableSpendCut: variableCutPct / 100,
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
    salaryPct,
    recurringCutPct,
    variableCutPct,
    extraIncome,
    extraOutflow,
  ]);

  if (!hydrated || !result) return null;
  const base = result.baseline;
  const sim = result.simulated;
  const better = result.delta > 0;
  const flat = result.delta === 0;
  const tone = flat ? "#A1A1AA" : better ? "#34D399" : "#F87171";

  function reset() {
    setSalaryPct(0);
    setRecurringCutPct(0);
    setVariableCutPct(0);
    setExtraIncome(0);
    setExtraOutflow(0);
  }

  const advice = buildAdvice({ result, salaryPct, recurringCutPct, variableCutPct });

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card sm:col-span-6 flex flex-col gap-4 rounded-3xl p-5"
      style={{
        background: "linear-gradient(135deg, #22D3EE12 0%, transparent 70%)",
        borderColor: "#22D3EE33",
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 items-center justify-center rounded-2xl"
            style={{ background: "#22D3EE26", color: "#22D3EE" }}
          >
            <Sliders className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">CFO Sandbox</span>
            <span className="text-caption text-muted-foreground">
              גרור שינויים. ראה איך נראית סוף החודש.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-caption text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" />
          איפוס
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="תחזית מקורית"
          value={ILS.format(Math.round(base.forecast))}
        />
        <Stat
          label="לאחר השינויים"
          value={ILS.format(Math.round(sim.forecast))}
          tone={tone}
        />
      </div>

      <div
        className="flex items-center justify-between rounded-2xl border px-4 py-3"
        style={{
          background: `${tone}10`,
          borderColor: `${tone}40`,
          color: tone,
        }}
      >
        <span className="text-caption">שינוי נטו לסוף החודש</span>
        <span data-mono="true" dir="ltr" className="text-section">
          {better ? "+" : ""}
          {ILS.format(Math.round(result.delta))}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <Slider
          icon={<Wallet className="size-3.5" />}
          label="שינוי בשכר"
          min={-50}
          max={50}
          step={5}
          value={salaryPct}
          onChange={setSalaryPct}
          display={fmtPct(salaryPct)}
        />
        <Slider
          icon={<Repeat className="size-3.5" />}
          label="קיצוץ הוצאות קבועות"
          min={0}
          max={100}
          step={5}
          value={recurringCutPct}
          onChange={setRecurringCutPct}
          display={`${recurringCutPct}%`}
        />
        <Slider
          icon={<TrendingDown className="size-3.5" />}
          label="קיצוץ הוצאות משתנות"
          min={0}
          max={100}
          step={5}
          value={variableCutPct}
          onChange={setVariableCutPct}
          display={`${variableCutPct}%`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="בונוס חד-פעמי"
          icon={<TrendingUp className="size-3.5" />}
          value={extraIncome}
          onChange={setExtraIncome}
        />
        <NumberField
          label="הוצאה חד-פעמית"
          icon={<HandCoins className="size-3.5" />}
          value={extraOutflow}
          onChange={setExtraOutflow}
        />
      </div>

      {advice ? (
        <p
          className="rounded-2xl border px-3 py-2 text-caption leading-relaxed"
          style={{
            background: "#22D3EE10",
            borderColor: "#22D3EE33",
            color: "var(--foreground)",
          }}
        >
          💡 {advice}
        </p>
      ) : null}

      <p className="text-micro text-muted-foreground/70">
        סימולציה בלבד. הנתונים שלך לא משתנים. החישוב מתייחס לסוף החודש הנוכחי.
      </p>
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
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3">
      <span className="text-micro uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-section"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Slider({
  icon,
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
}: {
  icon: React.ReactNode;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span dir="ltr" data-mono="true" className="text-foreground">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#22D3EE]"
      />
    </div>
  );
}

function NumberField({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-caption text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        dir="ltr"
        data-mono="true"
        className="h-10 rounded-2xl border border-white/8 bg-black/30 px-3 text-body text-foreground outline-none focus:border-[#22D3EE]/60"
      />
    </label>
  );
}

function buildAdvice(args: {
  result: ReturnType<typeof simulateForecast>;
  salaryPct: number;
  recurringCutPct: number;
  variableCutPct: number;
}): string | null {
  const { result, salaryPct, recurringCutPct, variableCutPct } = args;
  const delta = result.delta;
  const base = result.baseline.forecast;
  const sim = result.simulated.forecast;

  if (delta === 0) {
    return "טרם הזזת מנופים — נסה לקצץ הוצאות משתנות ב-20% כדי לראות איך התחזית מגיבה.";
  }
  if (base < 0 && sim >= 0) {
    return `יפה. עם השינויים האלה, החודש יוצא מהאדום. שמור את הקיצוצים הגדולים בעולם האמיתי.`;
  }
  if (base >= 0 && sim < 0) {
    return `שים לב — השילוב הזה דוחף אותך לתזרים שלילי. אזן בעזרת קיצוץ קבועים או בונוס חד-פעמי.`;
  }
  if (delta > 0 && variableCutPct >= 30) {
    return `קיצוץ של ${variableCutPct}% בהוצאות משתנות מוסיף בערך ${ILS.format(Math.round(delta))} לסוף החודש — בר־השגה אם תתחיל לעקוב יום-יום.`;
  }
  if (delta > 0 && recurringCutPct >= 20) {
    return `הפחתה של ${recurringCutPct}% בהוצאות הקבועות חוסכת ${ILS.format(Math.round(delta))}. שווה לחזור על המנויים פעם בחודש.`;
  }
  if (delta > 0 && salaryPct > 0) {
    return `עליית שכר של ${salaryPct}% מוסיפה ${ILS.format(Math.round(delta))} לסוף החודש. תכנן מראש לאן הכסף הולך — חיסכון, חוב, או השקעה.`;
  }
  if (delta < 0) {
    return `השילוב הזה עולה לך ${ILS.format(Math.round(Math.abs(delta)))}. ודא שהוא מתוכנן, לא הפתעה.`;
  }
  return null;
}
