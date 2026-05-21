// Recurring-rule cost drift detection.
//
// When the user's auto-matched recurring charges (Netflix, electricity,
// gym) get materially more or less expensive than the rule's
// `estimatedAmount`, surface it so they can update the estimate.
// Drives the "אומדן לא תואם" drift card.
//
// Pure compute — no mutation, no persistence.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { addMonths } from "@/lib/dates";

export type RuleDrift = {
  ruleId: string;
  label: string;
  estimatedAmount: number;
  /** This-month actual (status.actualAmount, falls back to matched
   *  entry.amount when actualAmount is missing). */
  currentActual: number;
  /** Average of `lookback` recent paid months — includes currentActual.
   *  Drives the suggested new estimate. */
  recentAverage: number;
  /** Months that contributed to recentAverage (count). */
  monthsCovered: number;
  /** currentActual / estimatedAmount. */
  ratio: number;
  direction: "up" | "down";
  severity: "watch" | "alert";
  /** Suggested new estimatedAmount — rounded to nearest ₪1. */
  suggestedEstimate: number;
};

const UP_WATCH = 1.15;
const UP_ALERT = 1.3;
const DOWN_WATCH = 0.85;
const DOWN_ALERT = 0.7;
const FLOOR_ILS = 30;
const MIN_MONTHS = 2;

export function detectRuleDrift(args: {
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  lookback?: number;
}): RuleDrift[] {
  const lookback = args.lookback ?? 3;
  const entryById = new Map(args.entries.map((e) => [e.id, e]));

  // Helper: actual amount for a rule in a given month, if status is paid.
  function actualFor(ruleId: string, monthKey: MonthKey): number | undefined {
    const status = args.statuses.find(
      (s) => s.ruleId === ruleId && s.monthKey === monthKey,
    );
    if (!status || status.status !== "paid") return undefined;
    if (typeof status.actualAmount === "number") return status.actualAmount;
    if (status.matchedExpenseId) {
      const entry = entryById.get(status.matchedExpenseId);
      if (entry) return entry.amount;
    }
    return undefined;
  }

  const out: RuleDrift[] = [];
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (rule.estimatedAmount < FLOOR_ILS) continue;
    const current = actualFor(rule.id, args.monthKey);
    if (current === undefined) continue;
    if (current < FLOOR_ILS) continue;

    // Build coverage including current month.
    const samples: number[] = [current];
    for (let i = 1; i <= lookback; i++) {
      const prior = addMonths(args.monthKey, -i);
      const v = actualFor(rule.id, prior);
      if (v !== undefined) samples.push(v);
    }
    if (samples.length < MIN_MONTHS) continue;

    const ratio = current / rule.estimatedAmount;
    let direction: RuleDrift["direction"];
    let severity: RuleDrift["severity"];
    if (ratio >= UP_WATCH) {
      direction = "up";
      severity = ratio >= UP_ALERT ? "alert" : "watch";
    } else if (ratio <= DOWN_WATCH) {
      direction = "down";
      severity = ratio <= DOWN_ALERT ? "alert" : "watch";
    } else {
      continue;
    }

    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    const suggested = Math.max(FLOOR_ILS, Math.round(avg));

    out.push({
      ruleId: rule.id,
      label: rule.label,
      estimatedAmount: rule.estimatedAmount,
      currentActual: current,
      recentAverage: avg,
      monthsCovered: samples.length,
      ratio,
      direction,
      severity,
      suggestedEstimate: suggested,
    });
  }

  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "alert" ? -1 : 1;
    return Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1);
  });

  return out;
}
