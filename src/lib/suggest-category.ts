// Wallet-first category suggestion engine.
//
// Given an inbound transaction (merchant + amount + optional
// cardLast4) and the user's existing entry/rule history, returns
// the most likely category plus a confidence score so the
// InstantConfirmSheet can pre-select it for a single-tap approval.
//
// Priority order (highest first):
//   1. EXACT match on a linked recurring rule → high
//   2. Merchant→category history (modal vote across past entries
//      for this canonical merchant) → high (≥3 priors, unanimous)
//                                    medium (3+ priors, mixed)
//                                    low (1-2 priors)
//   3. Static categorize() heuristic on merchant string → medium
//   4. Fallback to "other" → low
//
// Pure compute. No store, no React. Reuses merchantKey for
// canonical comparison so "שופרסל סניף 12" + "שופרסל" collapse to
// one history bucket.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import { categorize } from "@/lib/parsers";
import { merchantKey } from "@/lib/sanitize";

export type SuggestionConfidence = "high" | "medium" | "low";

export type CategorySuggestion = {
  category: CategoryId;
  confidence: SuggestionConfidence;
  /** Hebrew explainer rendered as a sub-line on the confirm sheet. */
  reason: string;
};

export type SuggestInput = {
  merchant: string | undefined;
  amount: number;
  cardLast4?: string;
  /** History the engine learns from. */
  entries: ExpenseEntry[];
  rules: RecurringRule[];
};

export function suggestCategory(input: SuggestInput): CategorySuggestion {
  const merchant = (input.merchant ?? "").trim();
  const mkey = merchantKey(merchant);

  // 1. Linked recurring rule — best signal we have. Match by
  //    canonical merchant tokens against rule.keywords + rule.label.
  if (mkey) {
    const matched = matchRule({
      merchant,
      mkey,
      rules: input.rules,
      amount: input.amount,
    });
    if (matched) {
      return {
        category: matched.category,
        confidence: "high",
        reason: `מקושר לכלל ״${matched.label}״`,
      };
    }
  }

  // 2. Merchant history — read confirmed entries with same canonical
  //    merchant. Skip refunds + pending. Vote.
  if (mkey) {
    const history = collectHistory({ mkey, entries: input.entries });
    if (history.total > 0) {
      const best = history.modal!;
      const unanimous = best.count === history.total;
      const confidence: SuggestionConfidence =
        history.total >= 3 && unanimous
          ? "high"
          : history.total >= 3
            ? "medium"
            : "low";
      return {
        category: best.category,
        confidence,
        reason:
          history.total === 1
            ? "ראינו את העסק פעם אחת בעבר"
            : `${best.count}/${history.total} מהחיובים האחרונים של העסק בקטגוריה זו`,
      };
    }
  }

  // 3. Static heuristic on the merchant string.
  if (merchant.length > 0) {
    const cat = categorize(merchant);
    if (cat !== "other") {
      return {
        category: cat,
        confidence: "medium",
        reason: "זיהוי לפי שם בית העסק",
      };
    }
  }

  // 4. Fallback.
  return {
    category: "other",
    confidence: "low",
    reason: "אין מספיק נתונים. בחר קטגוריה ידנית.",
  };
}

function matchRule(args: {
  merchant: string;
  mkey: string;
  rules: RecurringRule[];
  amount: number;
}): { category: CategoryId; label: string } | null {
  const lowered = args.merchant.toLowerCase();
  for (const rule of args.rules) {
    if (!rule.active) continue;
    // Amount within ±25% of estimated — same tolerance the existing
    // match.ts uses for recurring detection.
    const inAmountBand =
      rule.estimatedAmount > 0 &&
      Math.abs(args.amount - rule.estimatedAmount) <=
        rule.estimatedAmount * 0.25;
    if (!inAmountBand) {
      // Even out-of-band can match if a keyword hits.
    }
    if (containsAny(lowered, rule.keywords)) {
      return { category: rule.category, label: rule.label };
    }
    if (rule.label && lowered.includes(rule.label.toLowerCase())) {
      return { category: rule.category, label: rule.label };
    }
    if (
      inAmountBand &&
      containsAny(lowered, [rule.label.toLowerCase()])
    ) {
      return { category: rule.category, label: rule.label };
    }
  }
  return null;
}

type HistoryBucket = { category: CategoryId; count: number };
type HistoryResult = {
  total: number;
  modal: HistoryBucket | null;
};

function collectHistory(args: {
  mkey: string;
  entries: ExpenseEntry[];
}): HistoryResult {
  const counts = new Map<CategoryId, number>();
  let total = 0;
  for (const e of args.entries) {
    if (e.needsConfirmation && !e.confirmedAt) continue;
    if (e.bankPending) continue;
    if (e.isRefund) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const k = merchantKey(e.merchant ?? e.note ?? "");
    if (!k || k !== args.mkey) continue;
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    total++;
  }
  let modal: HistoryBucket | null = null;
  for (const [category, count] of counts) {
    if (!modal || count > modal.count) modal = { category, count };
  }
  return { total, modal };
}

function containsAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (!n) continue;
    if (haystack.includes(n.toLowerCase())) return true;
  }
  return false;
}
