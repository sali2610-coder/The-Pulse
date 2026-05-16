"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildMonthlyDigest, type Insight } from "@/lib/insights";

const TONE_STYLE = {
  positive: { bg: "rgba(52, 211, 153, 0.10)", border: "rgba(52, 211, 153, 0.32)", fg: "#34D399" },
  warning: { bg: "rgba(245, 196, 81, 0.10)", border: "rgba(245, 196, 81, 0.32)", fg: "#F5C451" },
  danger: { bg: "rgba(248, 113, 113, 0.10)", border: "rgba(248, 113, 113, 0.38)", fg: "#F87171" },
  neutral: { bg: "rgba(167, 139, 250, 0.10)", border: "rgba(167, 139, 250, 0.32)", fg: "#A78BFA" },
} as const;

function toneIcon(insight: Insight) {
  switch (insight.tone) {
    case "danger":
      return <AlertOctagon className="h-4 w-4" strokeWidth={1.7} />;
    case "warning":
      return <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />;
    case "positive":
      return <TrendingUp className="h-4 w-4" strokeWidth={1.7} />;
    default:
      return insight.value !== undefined && insight.value < 0 ? (
        <TrendingDown className="h-4 w-4" strokeWidth={1.7} />
      ) : (
        <Sparkles className="h-4 w-4" strokeWidth={1.7} />
      );
  }
}

export function MonthlyDigestCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const insights = useMemo(() => {
    if (!hydrated) return [];
    return buildMonthlyDigest({
      entries,
      rules,
      statuses,
      accounts,
      loans,
      incomes,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    loans,
    incomes,
    monthlyBudget,
  ]);

  if (!hydrated || insights.length === 0) return null;

  const featured = insights[0];
  const rest = insights.slice(1, 5);
  const featuredStyle = TONE_STYLE[featured.tone];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.4 }}
      className="glass-card relative overflow-hidden rounded-3xl p-5"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${featuredStyle.fg}55`,
      }}
    >
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} />
          סיכום החודש
        </div>
        <span className="text-[10px] text-muted-foreground">
          {insights.length} תובנות
        </span>
      </header>

      {/* Featured (highest-severity) — large, full-width */}
      <motion.div
        layoutId={`digest-${featured.id}`}
        className="flex items-center gap-3 rounded-2xl p-3"
        style={{
          background: featuredStyle.bg,
          border: `1px solid ${featuredStyle.border}`,
        }}
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            background: `${featuredStyle.fg}22`,
            color: featuredStyle.fg,
          }}
        >
          {toneIcon(featured)}
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {featured.label}
          </span>
          <span
            className="text-lg font-semibold"
            style={{ color: featuredStyle.fg }}
          >
            {featured.headline}
          </span>
          {featured.detail && (
            <span className="line-clamp-1 text-[11px] text-muted-foreground">
              {featured.detail}
            </span>
          )}
        </div>
      </motion.div>

      {/* Rest as compact pills, horizontally scrollable on overflow */}
      {rest.length > 0 && (
        <div
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {rest.map((insight) => {
            const style = TONE_STYLE[insight.tone];
            return (
              <motion.div
                key={insight.id}
                layoutId={`digest-${insight.id}`}
                className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  minWidth: "55%",
                }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${style.fg}22`, color: style.fg }}
                >
                  {toneIcon(insight)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    {insight.label}
                  </span>
                  <span
                    className="line-clamp-1 text-xs font-semibold"
                    style={{ color: style.fg }}
                  >
                    {insight.headline}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}
