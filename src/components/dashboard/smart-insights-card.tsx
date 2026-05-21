"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Moon,
  Sparkles,
  Wallet,
  Wand2,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { gatherSmartInsights } from "@/lib/smart-insights";
import { currentMonthKey } from "@/lib/dates";

type Chip = {
  key: string;
  label: string;
  count: number;
  tone: string;
  Icon: typeof Sparkles;
};

/**
 * Dashboard digest of every settings-resident detector. Renders
 * nothing when no detector has a surfaceable insight, so the
 * dashboard stays calm for tidy users. When at least one chip is
 * non-zero, mounts a single row that nudges the user toward the
 * settings tab.
 */
export function SmartInsightsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const insights = useMemo(() => {
    if (!hydrated) return null;
    return gatherSmartInsights({
      entries,
      rules,
      statuses,
      accounts,
      incomes,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries, rules, statuses, accounts, incomes, monthlyBudget]);

  if (!hydrated || !insights) return null;
  if (insights.total === 0) return null;

  const chips: Chip[] = [
    {
      key: "subs",
      label: "מנויים לזיהוי",
      count: insights.subscriptionCount,
      tone: "#00E5FF",
      Icon: Sparkles,
    },
    {
      key: "drift",
      label: "אומדנים לעדכון",
      count: insights.ruleDriftCount,
      tone: "#D4AF37",
      Icon: Wand2,
    },
    {
      key: "dormant",
      label: "קבועים רדומים",
      count: insights.dormantCount,
      tone: "#A1A1AA",
      Icon: Moon,
    },
    {
      key: "budget",
      label: "תקציב חדש",
      count: insights.budgetRecommendationAvailable ? 1 : 0,
      tone: "#34D399",
      Icon: Wallet,
    },
  ].filter((c) => c.count > 0);

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-neon/15 text-neon">
            <Sparkles className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-neon">
              תובנות חכמות
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {insights.total === 1
                ? "המתנה אחת לעיון"
                : `${insights.total} פריטים ממתינים`}
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          לטאב הגדרות
          <ChevronLeft className="size-3" />
        </span>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const Icon = chip.Icon;
          return (
            <span
              key={chip.key}
              className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
              style={{
                borderColor: `${chip.tone}66`,
                background: `${chip.tone}14`,
                color: chip.tone,
              }}
            >
              <Icon className="size-3" strokeWidth={1.8} />
              <span className="text-foreground/90">{chip.label}</span>
              <span data-mono="true" dir="ltr">
                {chip.count}
              </span>
            </span>
          );
        })}
      </div>
    </motion.section>
  );
}
