"use client";

// Phase 382 — "בקרת תקציב" reads the canonical buildDailyBudgetView.
//
// Previously this card spoke a vague "המערכת מחשבת ברקע" copy and
// composed its own number via autoBudget. It now mirrors the daily
// budget engine the rest of the app reads, with one extra
// subtraction for the "כרית ביטחון" slider.
//
// One source of truth. No invented math.

import { motion } from "framer-motion";
import { ShieldCheck, Target } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";
import { buildDailyBudgetView } from "@/lib/daily-budget-view";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";

import { formatCurrencyAmount } from "@/lib/money";
const ILS = { format: (v: number) => formatCurrencyAmount(v) };

export function BudgetInput() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const setBuffer = useFinanceStore((s) => s.setBudgetSafetyBuffer);

  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  if (!hydrated) return null;

  const view = buildDailyBudgetView({
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
  });

  // Buffer is subtracted from the canonical real-available figure so
  // the engine number and the UI agree on every other surface; the
  // user only pays for the buffer here.
  const available = view.realAvailable - Math.max(0, buffer);
  const negative = available < 0;
  const sign = available > 0 ? "+" : available < 0 ? "−" : "";
  const headline = `${sign}${ILS.format(Math.abs(available))}`;
  const valueColor = negative ? "#F87171" : "#34D399";

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="flex items-center gap-2.5">
        <Target className="size-4 text-gold" />
        <div className="flex flex-col leading-tight">
          <span className="text-section text-foreground">בקרת תקציב</span>
          <span className="text-caption text-muted-foreground">
            אותו חישוב כמו &ldquo;מותר היום&rdquo; ובמסך ההוצאות
          </span>
        </div>
      </header>

      <motion.div
        layout
        className="mt-4 flex items-baseline justify-between gap-3"
      >
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            עד ה-10 לחודש הבא
          </span>
          <span className="text-[10.5px] text-muted-foreground/70">
            {view.anchorOffset} ימים
          </span>
        </div>
        <motion.span
          key={headline}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          data-mono="true"
          dir="ltr"
          className="text-[28px] font-light"
          style={{ color: valueColor }}
        >
          {headline}
        </motion.span>
      </motion.div>

      <p className="mt-2 text-[13px] font-medium leading-tight text-foreground/90">
        {negative
          ? "התקציב שלך כבר בחריגה עד המשכורת"
          : "זה התקציב הזמין שלך עד המשכורת"}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
        החישוב כולל יתרה צפויה, הכנסות, התחייבויות והוצאות שכבר נרשמו.
      </p>

      {/* Breakdown row — every shekel traced to its source */}
      <ul
        className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-foreground/80"
        dir="rtl"
      >
        <BreakdownCell
          label="יתרה צפויה ב-10"
          value={view.forecastBankAtAnchor}
        />
        <BreakdownCell label="הכנסות" value={view.expectedIncome} positive />
        <BreakdownCell
          label="התחייבויות"
          value={-view.totalCommitments}
          negative
        />
        <BreakdownCell label="הוצאות היום" value={-view.spentToday} negative />
        <BreakdownCell
          label="כרית ביטחון"
          value={-Math.max(0, buffer)}
          negative
        />
        <BreakdownCell
          label="זמין בפועל"
          value={available}
          emphasis
        />
      </ul>

      <label className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12.5px] text-foreground">
            <ShieldCheck className="size-4 text-[color:var(--neon)]" />
            כרית ביטחון
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[12.5px] font-medium text-foreground"
          >
            {ILS.format(buffer)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={5000}
          step={50}
          value={buffer}
          onChange={(e) => {
            setBuffer(Number(e.target.value));
            void flushBudgetSettings();
          }}
          onPointerDown={() => tap()}
          className="w-full accent-[color:var(--neon)]"
          aria-label="כרית ביטחון"
        />
        <span className="text-[10.5px] text-muted-foreground/80">
          הסכום יישמר בצד ולא ייכנס לתקציב הפנוי.
        </span>
      </label>
    </section>
  );
}

function BreakdownCell({
  label,
  value,
  positive,
  negative,
  emphasis,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  emphasis?: boolean;
}) {
  const fg = emphasis
    ? value < 0
      ? "#F87171"
      : "#34D399"
    : positive
      ? "#34D399"
      : negative
        ? "#F87171"
        : "rgba(255,255,255,0.95)";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <li
      className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
      style={emphasis ? { borderColor: `${fg}33` } : undefined}
    >
      <span className="text-muted-foreground/85">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="font-medium"
        style={{ color: fg, fontVariantNumeric: "tabular-nums" }}
      >
        {sign}
        {ILS.format(Math.abs(value))}
      </span>
    </li>
  );
}
