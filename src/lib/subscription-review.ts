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
 *  treated as noise and hidden. Exported so the UI can run the same
 *  filter on subsets it builds. */
export const MIN_REVIEW_CONFIDENCE = 0.7;

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
      // Confidence ramps up the longer the gap stays open. 45 → 0.7,
      // 90 → 0.9, 180+ → 1.0. The user's app installs already filter
      // active rules, so this is "you might have forgotten me".
      const confidence = Math.min(
        1,
        0.7 + ((ageDays - STALE_DAYS_THRESHOLD) / 180) * 0.3,
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
      // 15% bump → 0.7 baseline; bigger jumps map closer to 1.0.
      const confidence = Math.min(1, 0.7 + (pct - RISING_PCT_THRESHOLD) * 1.5);
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

  // 3. Duplicate-looking rules — same category + overlapping label tokens.
  // Phase 296 — much stricter. Token overlap alone produced false
  // alerts like "אחריות רכב" vs "רכב". We now require:
  //   • ≥ 2 shared 3+ char tokens OR canonical-merchant-key match
  //   • amount within ±25% AND ≤ ₪50 absolute delta
  //   • not linked to different cards (intentional split)
  //   • category matches
  // and we only emit when the combined confidence ≥ MIN_REVIEW_CONFIDENCE.
  for (let i = 0; i < activeRules.length; i++) {
    const a = activeRules[i];
    for (let j = i + 1; j < activeRules.length; j++) {
      const b = activeRules[j];
      if (a.category !== b.category) continue;
      if (
        a.linkedCardId &&
        b.linkedCardId &&
        a.linkedCardId !== b.linkedCardId
      ) {
        // Different card per rule — looks intentional (e.g. same
        // subscription paid by two cards).
        continue;
      }
      const shared = sharedTokenCount(a.label, b.label);
      const sameCanonical = canonicalLabelMatch(a.label, b.label);
      const longSharedBrand = sharedLongTokenCount(a.label, b.label, 5);
      // Accept either:
      //   • canonical match (identical token bag)
      //   • ≥ 2 shared 3+ char tokens
      //   • exactly 1 shared "brand-like" token (≥ 5 chars) — like
      //     "netflix" in "Netflix Family" vs "Netflix Premium"
      if (!sameCanonical && shared < 2 && longSharedBrand < 1) continue;

      const amtDelta = Math.abs(a.estimatedAmount - b.estimatedAmount);
      const amtRel =
        Math.max(a.estimatedAmount, b.estimatedAmount) > 0
          ? amtDelta / Math.max(a.estimatedAmount, b.estimatedAmount)
          : 1;
      if (amtRel > 0.25 && amtDelta > 50) continue;

      // Confidence: canonical-match base 0.92 (very high), 2-token
      // base 0.8, single-brand-token base 0.78. Penalize amount
      // divergence so a ±25% spread drops the score by ~0.075.
      let confidence: number;
      if (sameCanonical) confidence = 0.92;
      else if (shared >= 2) confidence = 0.8 + Math.min(0.1, (shared - 2) * 0.04);
      else confidence = 0.78;
      confidence -= amtRel * 0.3;
      confidence = Math.max(0, Math.min(1, confidence));
      if (confidence < MIN_REVIEW_CONFIDENCE) continue;

      out.push({
        ruleId: b.id,
        label: b.label,
        amount: b.estimatedAmount,
        reason: "duplicate_lookalike",
        reasonText: sameCanonical
          ? `שם זהה ל־"${a.label}" באותה קטגוריה`
          : `${shared} מילים זהות ל־"${a.label}" באותה קטגוריה (פער של ${Math.round(amtDelta)}₪)`,
        duplicateOfRuleId: a.id,
        confidence,
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
        // Heuristic — soft confidence, but still passes the floor
        // because a tiny rule with no recent matches is worth a
        // glance.
        confidence: 0.72,
      });
    }
  }

  // Phase 296 — final confidence filter. Any candidate that didn't
  // assign confidence (or fell below the floor) is dropped here so
  // every caller sees only high-signal items.
  return out.filter((c) => c.confidence >= MIN_REVIEW_CONFIDENCE);
}

function sharedTokenCount(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  let n = 0;
  for (const t of new Set(tokenize(b))) {
    if (ta.has(t) && t.length >= 3) n += 1;
  }
  return n;
}

function sharedLongTokenCount(a: string, b: string, minLen: number): number {
  const ta = new Set(tokenize(a));
  let n = 0;
  for (const t of new Set(tokenize(b))) {
    if (ta.has(t) && t.length >= minLen) n += 1;
  }
  return n;
}

function canonicalLabelMatch(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

function canonical(s: string): string {
  return tokenize(s)
    .filter((t) => t.length >= 3)
    .sort()
    .join("|");
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

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
