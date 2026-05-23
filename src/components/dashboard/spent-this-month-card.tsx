"use client";

// Phase 201 — Spending Truth card.
//
// Trust-layer rewrite: surfaces the same canonical "spentSoFar"
// number but adds:
//   * daily average + day-of-month context
//   * biggest category share
//   * vs prior-month-through-today delta
//   * coarse burn-rate chip (calm / steady / hot)
//   * confidence chip (drives off pending vs finalized ratio)
//   * "איך זה מחושב?" explain sheet
//   * data-freshness stamp
//   * premium empty state when no charges this month

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Sparkles, TrendingDown, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendingTruth } from "@/lib/spending-truth";
import { explainMonthlySpent } from "@/lib/explainability";
import { confidenceForSpentThisMonth } from "@/lib/confidence";
import { dataFreshness } from "@/lib/data-freshness";
import { getCategory } from "@/lib/categories";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { ExplainSheet } from "@/components/ui/explain-sheet";
import { ConfidenceChip } from "@/components/ui/confidence-chip";
import { DataFreshnessStamp } from "@/components/ui/data-freshness-stamp";
import { CardEmpty } from "@/components/ui/card-empty";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SPRING_SOFT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", { month: "long" });

const BURN_LABEL = {
  calm: "קצב רגוע",
  steady: "קצב יציב",
  hot: "קצב גבוה",
} as const;

const BURN_SEV: Record<"calm" | "steady" | "hot", InsightSeverity> = {
  calm: "info",
  steady: "watch",
  hot: "warn",
};

export function SpentThisMonthCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const lastSyncedAt = useFinanceStore((s) => s.lastSyncedAt);

  const truth = useMemo(() => {
    if (!hydrated) return null;
    return spendingTruth({ entries });
  }, [hydrated, entries]);

  const confidence = useMemo(
    () => (hydrated ? confidenceForSpentThisMonth({ entries }) : null),
    [hydrated, entries],
  );

  const freshness = useMemo(
    () =>
      hydrated
        ? dataFreshness({
            entries,
            rules,
            loans,
            incomes,
            lastSyncedAt,
          })
        : null,
    [hydrated, entries, rules, loans, incomes, lastSyncedAt],
  );

  if (!hydrated || !truth) return null;

  const [y, m] = truth.monthKey.split("-").map(Number);
  const monthLabel = MONTH_FMT.format(new Date(y, (m ?? 1) - 1, 1));

  const explanation = explainMonthlySpent(truth);
  const biggestCat = truth.biggestCategory
    ? getCategory(truth.biggestCategory.category)
    : null;
  const deltaSign = truth.delta > 0 ? "+" : truth.delta < 0 ? "−" : "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="glass-card flex flex-col gap-2.5 rounded-3xl p-4"
    >
      <SectionHeader
        icon={<TrendingDown />}
        title="הוצאתי החודש"
        trailing={
          <div className="flex items-center gap-1">
            <InsightChip severity="info" label={monthLabel} />
            <ExplainSheet
              explanation={explanation}
              confidence={confidence ?? undefined}
            />
          </div>
        }
      />

      {truth.spentSoFar === 0 ? (
        <CardEmpty
          icon={<Wallet className="size-4" />}
          title="עוד לא נרשמו חיובים החודש"
          reason="כשתיכנס תנועה — אוטומטית או ידנית — נראה אותה כאן."
          unlockHint={`הוסף חיוב ידני, או חבר אוטומציית Wallet ב"הגדרות".`}
        />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              data-mono="true"
              dir="ltr"
              className="text-[32px] font-light leading-none text-foreground"
            >
              <AnimatedCounter
                value={truth.spentSoFar}
                format={(v) => ILS.format(v)}
              />
            </span>
            <span className="text-[11px] text-muted-foreground/85">
              על פני {truth.charges} חיובים
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <InsightChip
              severity={BURN_SEV[truth.burnRate]}
              icon={<Flame className="size-2.5" />}
              label={BURN_LABEL[truth.burnRate]}
            />
            {confidence ? <ConfidenceChip level={confidence.level} /> : null}
            {biggestCat ? (
              <InsightChip
                severity="info"
                icon={<Sparkles className="size-2.5" />}
                label={biggestCat.label}
                value={`${Math.round(
                  (truth.biggestCategory?.share ?? 0) * 100,
                )}%`}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-3 text-[11px]">
            <Stat
              label="ממוצע יומי"
              value={ILS.format(truth.dailyAverage)}
              sub={`עד יום ${truth.dayOfMonth} בחודש`}
            />
            <Stat
              label="לעומת חודש קודם"
              value={
                truth.priorMonthSpentSoFar > 0
                  ? `${deltaSign}${ILS.format(Math.abs(truth.delta))}`
                  : "—"
              }
              sub={
                truth.priorMonthSpentSoFar > 0
                  ? `אז ${ILS.format(truth.priorMonthSpentSoFar)} עד אותו יום`
                  : "אין נתון משווה"
              }
              tone={
                truth.delta > 0
                  ? "danger"
                  : truth.delta < 0
                    ? "success"
                    : "neutral"
              }
            />
          </div>

          {truth.refundCredit > 0 ? (
            <p className="text-[11px] text-[#34D399]">
              + זיכויים החודש {ILS.format(truth.refundCredit)}
            </p>
          ) : null}

          <p className="text-[10px] text-muted-foreground/80">
            סכום זה לא תלוי ביתרת הבנק. רק חיובים שנכנסו בפועל מתחילת החודש.
          </p>
        </>
      )}

      {freshness ? <DataFreshnessStamp freshness={freshness} /> : null}
    </motion.section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "danger" ? "#F87171" : tone === "success" ? "#34D399" : undefined;
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[13px] font-medium text-foreground"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground/85">{sub}</span>
    </div>
  );
}
