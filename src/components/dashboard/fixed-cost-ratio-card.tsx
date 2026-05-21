"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Gauge, Lock } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { computeFixedCostRatio } from "@/lib/fixed-cost-ratio";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONES = {
  calm: "#34D399",
  watch: "#FCD34D",
  warn: "#D4AF37",
  alert: "#F87171",
} as const;

const HEADLINES = {
  calm: "כיסוי בריא של ההכנסה",
  watch: "מחויבות יחסית גבוהה",
  warn: "מעט מרווח להוצאות גמישות",
  alert: "התחייבויות חוצות סף הסיכון",
} as const;

/**
 * Fixed-cost ratio gauge. Renders only when there's active income +
 * something committed. Surfaces the % of monthly income consumed by
 * recurring rules + loans, tone-tinted by severity, with the
 * variable-budget headroom in ₪.
 */
export function FixedCostRatioCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const statuses = useFinanceStore((s) => s.statuses);

  const ratio = useMemo(() => {
    if (!hydrated) return null;
    return computeFixedCostRatio({
      rules,
      loans,
      incomes,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, loans, incomes, statuses]);

  if (!hydrated || !ratio) return null;
  if (ratio.totalFixed <= 0) return null;

  const tone = TONES[ratio.severity];
  const pct = Math.min(100, Math.round(ratio.ratio * 100));
  const headline = HEADLINES[ratio.severity];
  const overcommitted = ratio.variableHeadroom < 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}22`, color: tone }}
          >
            <Gauge className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              מחויבות חודשית
            </span>
            <span className="text-[11.5px] text-muted-foreground">{headline}</span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[17px] font-semibold"
          style={{ color: tone }}
        >
          {pct}%
        </span>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1" data-mono="true" dir="ltr">
          <Lock className="size-3 text-muted-foreground/60" />
          {ILS.format(ratio.totalFixed)} מ־{ILS.format(ratio.totalIncome)}
        </span>
        {ratio.recurringFixed > 0 ? (
          <span data-mono="true" dir="ltr">
            קבועים {ILS.format(ratio.recurringFixed)}
          </span>
        ) : null}
        {ratio.loanFixed > 0 ? (
          <span data-mono="true" dir="ltr">
            הלוואות {ILS.format(ratio.loanFixed)}
          </span>
        ) : null}
      </div>

      <div
        className="flex items-center justify-between rounded-2xl border px-3 py-2 text-[11px]"
        style={{
          borderColor: overcommitted ? "#F8717166" : "#34D39966",
          background: overcommitted ? "#F8717114" : "#34D39914",
        }}
      >
        <span className="text-muted-foreground">
          {overcommitted ? "חריגה ביחס להכנסה" : "פנוי להוצאות גמישות"}
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="font-semibold"
          style={{ color: overcommitted ? "#F87171" : "#34D399" }}
        >
          {overcommitted ? "−" : "+"}
          {ILS.format(Math.abs(ratio.variableHeadroom))}
        </span>
      </div>
    </motion.section>
  );
}
