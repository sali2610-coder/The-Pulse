// Phase 270 — recurring-obligations section summary.
//
// The "חיובים שיורדים אוטומטית כל חודש" section in the Expenses tab
// is reference / advanced material. Default-collapsed UX needs a
// header chip the user can scan without expanding:
//
//   • how many recurring sources fire this month
//   • total monthly obligation
//   • whether there's anything worth opening for (anomaly count)
//
// Pure derivation. No engine change. Reuses the existing detectors
// so the source-of-truth lives in one place.
//
// Anomalies surfaced:
//   - rule drift   (estimated vs. actual diverges)
//   - dormant rule (active, never paid for K months)
//   - subscription candidate (auto-detected recurring not yet ruled)
//   - ending soon  (installment plan has ≤ 1 payment left)
//
// "ending soon" is computed here from the schedule itself — it's a
// non-anomalous insight ("this charge is about to disappear from your
// monthly cost") that still deserves user attention.
//
// Insight count drives tone: 0 → "info" (quiet), >0 → "warn" (open me).

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { detectRuleDrift } from "@/lib/rule-drift";
import { detectDormantRules } from "@/lib/rule-dormancy";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { isInsightDismissed } from "@/lib/insight-dismiss";
import { ruleSchedule } from "@/lib/installment-schedule";

export type RecurringSectionSummary = {
  /** Distinct recurring sources firing in `monthKey`: active open-ended
   *  bills + active installment plans + active installment entries. */
  sourceCount: number;
  /** Sum of monthly obligations falling in `monthKey`. */
  monthlyTotal: number;
  insights: {
    drift: number;
    dormant: number;
    subscription: number;
    endingSoon: number;
    total: number;
  };
  /** "info" when quiet, "warn" when at least one insight exists. */
  tone: "info" | "warn";
};

function entrySliceFallsInMonth(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): { active: boolean; remaining: number } {
  if (entry.installments <= 1) return { active: false, remaining: 0 };
  const chargeMonth = entry.chargeDate.slice(0, 7);
  const [cy, cm] = chargeMonth.split("-").map(Number);
  const [my, mm] = monthKey.split("-").map(Number);
  const sliceIndex = (my - cy) * 12 + (mm - cm);
  if (sliceIndex < 0 || sliceIndex >= entry.installments) {
    return { active: false, remaining: 0 };
  }
  return {
    active: true,
    remaining: Math.max(0, entry.installments - (sliceIndex + 1)),
  };
}

export function buildRecurringSectionSummary(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): RecurringSectionSummary {
  let sourceCount = 0;
  let monthlyTotal = 0;
  let endingSoon = 0;

  for (const rule of args.rules) {
    if (!rule.active) continue;
    const schedule = ruleSchedule(rule, args.monthKey);
    if (!schedule.active) continue;
    sourceCount += 1;
    monthlyTotal += rule.estimatedAmount;
    if (schedule.remaining !== undefined && schedule.remaining <= 1) {
      endingSoon += 1;
    }
  }

  for (const entry of args.entries) {
    const slice = entrySliceFallsInMonth(entry, args.monthKey);
    if (!slice.active) continue;
    sourceCount += 1;
    monthlyTotal += entry.amount / entry.installments;
    if (slice.remaining <= 1) endingSoon += 1;
  }

  const drift = detectRuleDrift({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("rule-drift", d.ruleId)).length;

  const dormant = detectDormantRules({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("dormant-rule", d.ruleId)).length;

  const subscription = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  }).filter((c) => !isInsightDismissed("subscription", c.merchantKey)).length;

  const total = drift + dormant + subscription + endingSoon;

  return {
    sourceCount,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    insights: { drift, dormant, subscription, endingSoon, total },
    tone: total > 0 ? "warn" : "info",
  };
}
