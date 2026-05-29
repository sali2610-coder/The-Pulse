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
  /** Phase 296 — 0..1 confidence the signal is correct. The UI
   *  suppresses anything below the MIN_CONFIDENCE threshold so
   *  the user never sees fake duplicates. */
  confidence: number;
};

/** Phase 296 — minimum confidence floor. Anything below this is
 *  treated as noise and hidden. Phase 310 — bumped from 0.7 → 0.85
 *  after the "ניתוח פאקו 73%" false alert. Only high-signal items
 *  reach the user now. */
export const MIN_REVIEW_CONFIDENCE = 0.85;

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
      // Confidence ramps up the longer the gap stays open. Phase 310
      // — base bumped to 0.85 so this never fires until the gap
      // genuinely looks like a forgotten rule. 45 → 0.85, 180+ → 1.0.
      const confidence = Math.min(
        1,
        0.85 + ((ageDays - STALE_DAYS_THRESHOLD) / 180) * 0.15,
      );
      out.push({
        ruleId: rule.id,
        label: rule.label,
        amount: rule.estimatedAmount,
        reason: "stale_no_charge",
        reasonText: `לא נצפה חיוב כבר ${Math.round(ageDays)} ימים — אולי השירות בוטל וההגדרה נשארה.`,
        confidence,
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
      const pct = (m1 - m2) / m2;
      // Phase 310 — 15% bump → 0.85 baseline; bigger jumps map
      // closer to 1.0.
      const confidence = Math.min(1, 0.85 + (pct - RISING_PCT_THRESHOLD) * 1.5);
      out.push({
        ruleId: rule.id,
        label: rule.label,
        amount: m1,
        reason: "rising_price",
        reasonText: `החיוב עלה בכ־${Math.round(pct * 100)}% מהחודש הקודם (+${Math.round(delta)} ש"ח).`,
        confidence,
      });
    }
  }

  // Phase 310 — duplicate_lookalike branch removed entirely.
  // The label-token heuristic produced false alerts on rules
  // that shared a single generic Hebrew word ("ניתוח פאקו" vs
  // "ניתוח דם", "אחריות רכב" vs "רכב", etc.). Until the user
  // has a real per-transaction duplicate signal (same card + same
  // amount + same minute), this detector stays off.
  // The ReviewReason union still includes "duplicate_lookalike"
  // so type consumers (UI labels, dismissal storage) keep working
  // if the detector is re-enabled later.

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
        // Phase 310 — soft confidence bumped above the 0.85 floor.
        // Only fires for tiny rules with sparse coverage; the user
        // can still dismiss via the existing chip.
        confidence: 0.86,
      });
    }
  }

  // Phase 296 — final confidence filter. Any candidate that didn't
  // assign confidence (or fell below the floor) is dropped here so
  // every caller sees only high-signal items.
  return out.filter((c) => c.confidence >= MIN_REVIEW_CONFIDENCE);
}

// Phase 310 — sharedTokenCount / sharedLongTokenCount /
// canonicalLabelMatch / canonical helpers removed along with the
// duplicate_lookalike branch. tokenize() is no longer referenced
// here either.

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

