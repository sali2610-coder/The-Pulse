// Subscription / recurring-charge review suggestions.
//
// Complementary to subscription-detector (which surfaces UNDISCOVERED
// patterns to promote to rules) and dormant-rules-card (which flags
// rules with NO matched expenses). This module looks at the user's
// EXISTING RecurringRule set + the entry log and surfaces candidates
// the user should review for possible cancellation:
//
//   - stale_no_charge   — active rule, but no matched charge for ≥45 days.
//   - rising_price      — rule whose matched charges keep increasing
//                         month over month.
//   - duplicate_lookalike — two active rules whose canonicalised label
//                         tokens overlap and category matches (e.g. two
//                         Netflix entries).
//   - low_value_signal  — small charge (< ₪25/month) with no usage hint
//                         (the user-installed app can't measure "usage",
//                         so this is a heuristic on amount + low matched
//                         volume).
//
// Nothing here mutates state. The UI shows each candidate with a
// "לבדיקה" button — the user decides what to do.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type ReviewReason =
  | "stale_no_charge"
  | "rising_price"
  | "duplicate_lookalike"
  | "low_value_signal";

export type SubscriptionReviewCandidate = {
  ruleId: string;
  label: string;
  amount: number;
  reason: ReviewReason;
  reasonText: string;
  /** When known — the other rule id we believe is a duplicate. */
  duplicateOfRuleId?: string;
};

const STALE_DAYS_THRESHOLD = 45;
const RISING_PCT_THRESHOLD = 0.15; // 15% MoM bump signals drift
const LOW_VALUE_THRESHOLD = 25;

export function subscriptionReview(args: {
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  now?: Date;
}): SubscriptionReviewCandidate[] {
  const now = args.now ?? new Date();
  const out: SubscriptionReviewCandidate[] = [];

  const activeRules = args.rules.filter((r) => r.active);

  // 1. Stale rules — no matched expense within the threshold.
  for (const rule of activeRules) {
    const matched = args.entries
      .filter((e) => e.matchedRuleId === rule.id)
      .sort(
        (a, b) =>
          new Date(b.chargeDate).getTime() - new Date(a.chargeDate).getTime(),
      );
    const lastMatched = matched[0];
    if (!lastMatched) {
      // No match ever — let dormant-rules-card handle the "never seen"
      // signal; we skip here to avoid duplicate noise.
      continue;
    }
    const ageDays =
      (now.getTime() - new Date(lastMatched.chargeDate).getTime()) /
      86_400_000;
    if (ageDays >= STALE_DAYS_THRESHOLD) {
      out.push({
        ruleId: rule.id,
        label: rule.label,
        amount: rule.estimatedAmount,
        reason: "stale_no_charge",
        reasonText: `לא נצפה חיוב כבר ${Math.round(ageDays)} ימים — אולי השירות בוטל וההגדרה נשארה.`,
      });
    }
  }

  // 2. Rising price — compare last 3 monthly matched-amount averages.
  const currentKey = monthKeyOf(now);
  for (const rule of activeRules) {
    const monthly: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const mk = addMonths(currentKey, -i);
      const sum = sumMatchedForRule({
        entries: args.entries,
        ruleId: rule.id,
        monthKey: mk,
      });
      monthly.push(sum);
    }
    // Need at least 2 consecutive months with charges to spot a trend.
    if (monthly.filter((v) => v > 0).length < 2) continue;
    // Walk newest→oldest; we want a sustained uptick.
    const [m1, m2, m3] = monthly;
    if (m2 > 0 && m1 > 0 && (m1 - m2) / m2 >= RISING_PCT_THRESHOLD) {
      const delta = m1 - (m3 > 0 ? m3 : m2);
      out.push({
        ruleId: rule.id,
        label: rule.label,
        amount: m1,
        reason: "rising_price",
        reasonText: `החיוב עלה בכ־${Math.round(((m1 - m2) / m2) * 100)}% מהחודש הקודם (+${Math.round(delta)} ש"ח).`,
      });
    }
  }

  // 3. Duplicate-looking rules — same category + overlapping label tokens.
  for (let i = 0; i < activeRules.length; i++) {
    const a = activeRules[i];
    for (let j = i + 1; j < activeRules.length; j++) {
      const b = activeRules[j];
      if (a.category !== b.category) continue;
      if (!labelTokensOverlap(a.label, b.label)) continue;
      out.push({
        ruleId: b.id,
        label: b.label,
        amount: b.estimatedAmount,
        reason: "duplicate_lookalike",
        reasonText: `נראה דומה ל־"${a.label}" (אותה קטגוריה, מלים חופפות).`,
        duplicateOfRuleId: a.id,
      });
    }
  }

  // 4. Low-value signal — small amount AND only 1-2 matched charges
  //    in the last 3 months. The user might be paying for something
  //    they barely engage with.
  for (const rule of activeRules) {
    if (rule.estimatedAmount > LOW_VALUE_THRESHOLD) continue;
    let matchCount = 0;
    for (let i = 0; i < 3; i++) {
      const mk = addMonths(currentKey, -i);
      const cnt = countMatchedForRule({
        entries: args.entries,
        ruleId: rule.id,
        monthKey: mk,
      });
      matchCount += cnt;
    }
    if (matchCount > 0 && matchCount <= 2) {
      out.push({
        ruleId: rule.id,
        label: rule.label,
        amount: rule.estimatedAmount,
        reason: "low_value_signal",
        reasonText: `חיוב קטן (${Math.round(rule.estimatedAmount)} ש"ח) עם כיסוי נמוך לאחרונה — שווה לוודא שאתה משתמש בשירות.`,
      });
    }
  }

  return out;
}

function sumMatchedForRule(args: {
  entries: ExpenseEntry[];
  ruleId: string;
  monthKey: MonthKey;
}): number {
  let s = 0;
  for (const e of args.entries) {
    if (e.matchedRuleId !== args.ruleId) continue;
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    s += slice.amount;
  }
  return s;
}

function countMatchedForRule(args: {
  entries: ExpenseEntry[];
  ruleId: string;
  monthKey: MonthKey;
}): number {
  let n = 0;
  for (const e of args.entries) {
    if (e.matchedRuleId !== args.ruleId) continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    n++;
  }
  return n;
}

function labelTokensOverlap(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const set = new Set(ta);
  for (const t of tb) {
    if (set.has(t) && t.length >= 3) return true;
  }
  return false;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
