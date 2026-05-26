"use client";

// Phase 225 — Simple-mode hero card #1: "כמה נשאר לי לבזבז".
//
// Single large headline. Pure consumer-facing — no breakdowns, no
// internal jargon. Reuses dailyAllowance (existing engine) but
// renders one number front-and-centre with a short context line.
//
// Tone:
//   green  — allowance > 0 and the user hasn't blown today's slice
//   amber  — today's spend is within ±20% of allowance
//   red    — today's spend already exceeded allowance, OR allowance==0

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { dailyAllowance } from "@/lib/forecast";
import { monthKeyOf } from "@/lib/dates";
import { usePulseBudget } from "@/lib/use-pulse-budget";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function HeroSpendableCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);
  const pulseBudget = usePulseBudget({ monthlyBudget, budgetMode });

  const data = useMemo(() => {
    if (!hydrated) return null;
    return dailyAllowance({
      entries,
      rules,
      statuses,
      monthlyBudget: pulseBudget,
      monthKey: monthKeyOf(new Date()),
    });
  }, [hydrated, entries, rules, statuses, pulseBudget]);

  if (!hydrated || !data) {
    return <Skeleton />;
  }

  const { allowance, spentToday, daysRemaining } = data;
  const overSpent = spentToday > allowance;
  const closeToCap = spentToday >= allowance * 0.8 && !overSpent;
  const tone: "ok" | "warn" | "danger" =
    overSpent || allowance === 0 ? "danger" : closeToCap ? "warn" : "ok";

  const color =
    tone === "danger" ? "#F87171" : tone === "warn" ? "#F59E0B" : "#34D399";
  const subtitle = overSpent
    ? `כבר הוצאת היום ${ILS.format(spentToday)} — מעבר למכסה`
    : allowance === 0
      ? "נגמר התקציב לחודש"
      : `הוצאת היום ${ILS.format(spentToday)} · ${daysRemaining} ימים עד סוף החודש`;

  return (
    <section
      className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-6"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="כמה נשאר לי לבזבז"
    >
      <span className="text-micro text-muted-foreground">
        כמה נשאר לי לבזבז היום
      </span>
      <span data-mono="true" dir="ltr" className="text-hero" style={{ color }}>
        {ILS.format(Math.round(allowance))}
      </span>
      <span className="text-body text-muted-foreground">{subtitle}</span>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
      <span className="text-micro text-muted-foreground">
        כמה נשאר לי לבזבז היום
      </span>
      <span className="h-14 w-40 animate-pulse rounded bg-white/5" />
    </section>
  );
}
