// Phase 262 — single canonical "is this rule already covered by a
// real expense?" check.
//
// The original dedup only skipped a rule for the CURRENT month when
// statuses.paid pointed at it. Future months silently double-fired:
// once via the rule's expected amount AND once via the matched
// entry's `sliceForMonth` slice (especially severe with installment
// entries that cover many months).
//
// Returns a map ruleId → Set<MonthKey> covering every month an
// entry with `matchedRuleId === rule.id` actually fires in. Any
// rule-emitter MUST consult this map and skip emission for covered
// months — otherwise the cash-flow buckets, the per-card hierarchy,
// the category-spend report and the liquidity curve all over-count.
//
// Pure compute. No store.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

/** Months in [from, to] inclusive (rounded to the 1st of each
 *  month) as MonthKey strings — local generator so the helper is
 *  self-contained. */
function* monthsInWindow(from: Date, to: Date): Generator<MonthKey> {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    yield monthKeyOf(cursor);
    cursor.setMonth(cursor.getMonth() + 1);
  }
}

/** Map ruleId → set of MonthKeys already covered by at least one
 *  matched expense slice. Includes installment plans (multi-month
 *  coverage) and refunded entries (subtract = covered, not double-
 *  emit). */
export function monthsCoveredByMatchedEntries(args: {
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  now?: Date;
  windowDays?: number;
}): Map<string, Set<MonthKey>> {
  const out = new Map<string, Set<MonthKey>>();
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 90);
  const horizon = new Date(now.getTime() + windowDays * 86_400_000);
  const months: MonthKey[] = [];
  for (const m of monthsInWindow(now, horizon)) months.push(m);

  const ruleById = new Map<string, RecurringRule>(
    args.rules.map((r) => [r.id, r]),
  );

  for (const entry of args.entries) {
    if (!entry.matchedRuleId) continue;
    if (!ruleById.has(entry.matchedRuleId)) continue;
    const set = out.get(entry.matchedRuleId) ?? new Set<MonthKey>();
    for (const m of months) {
      // sliceForMonth handles installment-plan attribution
      // (calendar slice date == entry.chargeDate + N months).
      const slice = sliceForMonth(entry, m);
      if (slice) set.add(m);
    }
    out.set(entry.matchedRuleId, set);
  }

  return out;
}

/** Convenience: returns true when `monthKey` is already covered
 *  by a matched entry for `ruleId`. Use inside any rule emitter. */
export function isRuleCovered(
  coverage: Map<string, Set<MonthKey>>,
  ruleId: string,
  monthKey: MonthKey,
): boolean {
  return coverage.get(ruleId)?.has(monthKey) === true;
}
