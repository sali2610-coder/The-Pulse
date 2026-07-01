"use client";

// Phase 446 · AURORA recovery — Financial Insights reader
//
// Thin UI wrapper over gatherAiInsights. No new signals introduced;
// no engine calculation touched. Composes the same result shape the
// legacy Insights tab consumed, augmented with tone metadata + short
// Hebrew group labels for AURORA rendering.

import { useMemo } from "react";

import { currentMonthKey } from "@/lib/dates";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  gatherAiInsights,
  type AiInsight,
  type AiInsightGroup,
} from "@/lib/ai-insights";
import { useFinanceStore } from "@/lib/store";

export type AuroraInsightPriority = "critical" | "high" | "normal" | "calm";

export type AuroraInsight = AiInsight & {
  priorityBand: AuroraInsightPriority;
  toneColor: string;
  groupLabel: string;
};

export type AuroraInsightBucket = {
  group: AiInsightGroup;
  label: string;
  toneColor: string;
  insights: AuroraInsight[];
};

export type AuroraInsightsData = {
  ready: boolean;
  monthKey: string;
  total: number;
  criticalCount: number;
  urgentCount: number;
  positiveCount: number;
  headline: AuroraInsight | null;
  insights: AuroraInsight[];
  buckets: AuroraInsightBucket[];
};

const GROUP_TONE: Record<AiInsightGroup, string> = {
  risk: "var(--aurora-state-danger)",
  prediction: "var(--aurora-brand-aurora-2)",
  opportunity: "var(--aurora-accent-gold-loud)",
  trend: "var(--aurora-brand-aurora-1)",
  positive: "var(--aurora-state-safe)",
  recommendation: "var(--aurora-brand-aurora-3, var(--aurora-brand-aurora-2))",
};

function bandFor(i: AiInsight): AuroraInsightPriority {
  if (i.group === "positive") return "calm";
  const p = i.priority;
  if (p >= 15 || (i.severity === 3 && i.urgency === 3)) return "critical";
  if (p >= 11) return "high";
  return "normal";
}

const EMPTY: AuroraInsightsData = {
  ready: false,
  monthKey: "—",
  total: 0,
  criticalCount: 0,
  urgentCount: 0,
  positiveCount: 0,
  headline: null,
  insights: [],
  buckets: [],
};

export function useAuroraInsights(): AuroraInsightsData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraInsightsData>(() => {
    if (!hydrated) return EMPTY;
    const monthKey = currentMonthKey();
    const result = gatherAiInsights({
      entries,
      rules,
      statuses,
      accounts,
      loans,
      incomes,
      monthlyBudget,
      monthKey,
    });
    const decorated: AuroraInsight[] = result.insights.map((i) => ({
      ...i,
      priorityBand: bandFor(i),
      toneColor: GROUP_TONE[i.group],
      groupLabel: GROUP_LABELS[i.group],
    }));
    let criticalCount = 0;
    let urgentCount = 0;
    let positiveCount = 0;
    for (const i of decorated) {
      if (i.priorityBand === "critical") criticalCount += 1;
      else if (i.priorityBand === "high") urgentCount += 1;
      if (i.group === "positive") positiveCount += 1;
    }
    const buckets: AuroraInsightBucket[] = GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      toneColor: GROUP_TONE[group],
      insights: decorated.filter((i) => i.group === group),
    })).filter((b) => b.insights.length > 0);

    return {
      ready: true,
      monthKey,
      total: decorated.length,
      criticalCount,
      urgentCount,
      positiveCount,
      headline: decorated[0] ?? null,
      insights: decorated,
      buckets,
    };
  }, [hydrated, entries, rules, statuses, accounts, loans, incomes, monthlyBudget]);
}
