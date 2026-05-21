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

export type SmartInsights = {
  subscriptionCount: number;
  ruleDriftCount: number;
  dormantCount: number;
  budgetRecommendationAvailable: boolean;
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
  void args.accounts;
  void args.incomes;

  const subs = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  });
  const drift = detectRuleDrift({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const dormant = detectDormantRules({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const recommendation = recommendBudget({
    entries: args.entries,
    monthKey: args.monthKey,
  });
  const recommendationActionable =
    recommendation.hasEnoughData &&
    recommendation.recommended > 0 &&
    (args.monthlyBudget <= 0 ||
      Math.abs(recommendation.recommended - args.monthlyBudget) /
        args.monthlyBudget >=
        0.3);

  const subscriptionCount = subs.length;
  const ruleDriftCount = drift.length;
  const dormantCount = dormant.length;
  const budgetRecommendationAvailable = recommendationActionable;

  return {
    subscriptionCount,
    ruleDriftCount,
    dormantCount,
    budgetRecommendationAvailable,
    total:
      subscriptionCount +
      ruleDriftCount +
      dormantCount +
      (budgetRecommendationAvailable ? 1 : 0),
  };
}
