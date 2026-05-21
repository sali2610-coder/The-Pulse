// Dormant recurring-rule detection.
//
// Active rules that haven't been paid in K consecutive months still
// inflate `pendingFixed` in the CFO forecast every month. Surface them
// so the user can toggle them off (canceled gym, switched provider,
// moved out of an apartment). Pure compute — no mutation, no
// persistence.

import type {
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { addMonths, monthIndex, monthKeyOf } from "@/lib/dates";
import { ruleSchedule } from "@/lib/installment-schedule";

export type DormantRule = {
  ruleId: string;
  label: string;
  estimatedAmount: number;
  /** Number of consecutive months back from `monthKey` (inclusive of
   *  the lookback range) where the rule was pending but never paid. */
  dormantMonths: number;
  /** `YYYY-MM` of the most recent month the rule WAS paid, or undefined
   *  if it has never been paid. */
  lastPaidMonthKey?: MonthKey;
};

const DEFAULT_LOOKBACK = 3;

export function detectDormantRules(args: {
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  lookback?: number;
}): DormantRule[] {
  const lookback = args.lookback ?? DEFAULT_LOOKBACK;
  const targetIdx = monthIndex(args.monthKey);

  // Group statuses by rule for fast lookup.
  const byRule = new Map<string, RecurringStatus[]>();
  for (const s of args.statuses) {
    const list = byRule.get(s.ruleId) ?? [];
    list.push(s);
    byRule.set(s.ruleId, list);
  }

  const out: DormantRule[] = [];
  for (const rule of args.rules) {
    if (!rule.active) continue;
    // Skip installment rules that have legitimately completed.
    const sched = ruleSchedule(rule, args.monthKey);
    if (sched.isComplete) continue;
    if (sched.isFuture) continue;

    // Skip rules created within the lookback window — too new to judge.
    const createdAt = new Date(rule.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
      const createdIdx = monthIndex(monthKeyOf(createdAt));
      if (targetIdx - createdIdx < lookback) continue;
    }

    // Count consecutive dormant months within the lookback window.
    const ruleStatuses = byRule.get(rule.id) ?? [];
    let dormantMonths = 0;
    for (let i = 0; i < lookback; i++) {
      const mk = addMonths(args.monthKey, -i);
      const st = ruleStatuses.find((x) => x.monthKey === mk);
      if (st?.status === "paid") break;
      dormantMonths++;
    }
    if (dormantMonths < lookback) continue;

    // Find the most recent paid month, if any.
    const paidMonths = ruleStatuses
      .filter((s) => s.status === "paid")
      .map((s) => s.monthKey)
      .sort();
    const lastPaidMonthKey =
      paidMonths.length > 0 ? paidMonths[paidMonths.length - 1] : undefined;

    out.push({
      ruleId: rule.id,
      label: rule.label,
      estimatedAmount: rule.estimatedAmount,
      dormantMonths,
      lastPaidMonthKey,
    });
  }

  // Largest savings opportunity first.
  out.sort((a, b) => b.estimatedAmount - a.estimatedAmount);

  return out;
}
