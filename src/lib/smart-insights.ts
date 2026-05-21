// Smart Insights digest.
//
// Aggregates count signals from every settings-resident detector
// (subscription, rule drift, dormant rule, budget recommendation)
// into a single dashboard chip strip. Pure compute — no mutation,
// reuses each detector as-is so the source-of-truth stays in one
// place.

import type {
  Account,
  ExpenseEntry,
  Income,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { detectRuleDrift } from "@/lib/rule-drift";
import { detectDormantRules } from "@/lib/rule-dormancy";
import { recommendBudget } from "@/lib/budget-recommendation";
import { detectStaleAnchors } from "@/lib/anchor-staleness";
import { isInsightDismissed } from "@/lib/insight-dismiss";

export type SmartInsights = {
  subscriptionCount: number;
  ruleDriftCount: number;
  dormantCount: number;
  budgetRecommendationAvailable: boolean;
  staleAnchorCount: number;
  /** Sum of all surfaceable insights. */
  total: number;
};

export function gatherSmartInsights(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  incomes: Income[];
  monthlyBudget: number;
  monthKey: MonthKey;
}): SmartInsights {
  void args.incomes;

  const subs = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  }).filter((c) => !isInsightDismissed("subscription", c.merchantKey));
  const drift = detectRuleDrift({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("rule-drift", d.ruleId));
  const dormant = detectDormantRules({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("dormant-rule", d.ruleId));
  const recommendation = recommendBudget({
    entries: args.entries,
    monthKey: args.monthKey,
  });
  const recommendationActionable =
    recommendation.hasEnoughData &&
    recommendation.recommended > 0 &&
    !isInsightDismissed(
      "budget-recommendation",
      String(recommendation.recommended),
    ) &&
    (args.monthlyBudget <= 0 ||
      Math.abs(recommendation.recommended - args.monthlyBudget) /
        args.monthlyBudget >=
        0.3);

  const stale = detectStaleAnchors({ accounts: args.accounts });
  const subscriptionCount = subs.length;
  const ruleDriftCount = drift.length;
  const dormantCount = dormant.length;
  const budgetRecommendationAvailable = recommendationActionable;
  const staleAnchorCount = stale.length;

  return {
    subscriptionCount,
    ruleDriftCount,
    dormantCount,
    budgetRecommendationAvailable,
    staleAnchorCount,
    total:
      subscriptionCount +
      ruleDriftCount +
      dormantCount +
      staleAnchorCount +
      (budgetRecommendationAvailable ? 1 : 0),
  };
}
