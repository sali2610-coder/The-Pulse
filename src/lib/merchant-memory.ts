// Merchant-memory: learn category from user history.
//
// Phase 4.2 — the static `categorize()` table in parsers/index.ts
// covers brand-name merchants only. Anything outside that table
// falls to "other". This module fixes that by learning from the
// user's own history: every confirmed entry contributes a vote
// (merchant → category). At prediction time we return the
// majority category for the normalized merchant key, plus a
// confidence score so the consumer can decide whether to trust
// it.
//
// Pure compute. No React, no store, no Supabase. Consumes the
// existing ExpenseEntry[] and reuses `merchantKey` from sanitize.ts
// so memory entries are robust to "שופרסל סניף 12" vs "שופרסל".

import type { ExpenseEntry } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { merchantKey } from "@/lib/sanitize";

export type MerchantMemoryEntry = {
  /** The dominant category for this merchant. */
  category: CategoryId;
  /** Number of confirmed votes for `category`. */
  hits: number;
  /** Total votes seen for this merchant (any category). */
  total: number;
  /** hits / total — 1.0 means every entry for this merchant agrees. */
  confidence: number;
};

export type MerchantMemory = Map<string, MerchantMemoryEntry>;

/** Build the memory from the entry log. Skips entries the user hasn't
 *  effectively claimed:
 *    - no merchant text
 *    - needsConfirmation true (Wallet partial)
 *    - excludeFromBudget true (test rows)
 *    - isRefund true (refund != purchase)
 *  Each remaining entry contributes ONE vote for its category. */
export function buildMerchantMemory(entries: ExpenseEntry[]): MerchantMemory {
  // First pass: per-merchant per-category tally.
  const tally = new Map<string, Map<CategoryId, number>>();
  for (const e of entries) {
    if (!e.merchant) continue;
    if (e.needsConfirmation) continue;
    if (e.excludeFromBudget) continue;
    if (e.isRefund) continue;
    const key = merchantKey(e.merchant);
    if (!key) continue;
    const inner = tally.get(key) ?? new Map<CategoryId, number>();
    inner.set(e.category, (inner.get(e.category) ?? 0) + 1);
    tally.set(key, inner);
  }
  // Second pass: pick the dominant category per merchant.
  const out: MerchantMemory = new Map();
  for (const [key, inner] of tally) {
    let bestCat: CategoryId | null = null;
    let bestHits = 0;
    let total = 0;
    for (const [cat, hits] of inner) {
      total += hits;
      if (
        hits > bestHits ||
        // Tie-break: prefer the lexicographically smaller categoryId
        // so the output is deterministic across runs.
        (hits === bestHits && bestCat !== null && cat < bestCat)
      ) {
        bestHits = hits;
        bestCat = cat;
      }
    }
    if (bestCat === null) continue;
    out.set(key, {
      category: bestCat,
      hits: bestHits,
      total,
      confidence: total > 0 ? bestHits / total : 0,
    });
  }
  return out;
}

export type Prediction = {
  category: CategoryId;
  confidence: number;
  /** Number of historical entries the prediction is based on. */
  sampleSize: number;
};

/** Look up a merchant in memory. Returns null when the merchant has
 *  never been seen — the caller can fall back to the static
 *  categorize() table. */
export function predictCategory(
  memory: MerchantMemory,
  merchant: string,
): Prediction | null {
  if (!merchant) return null;
  const key = merchantKey(merchant);
  if (!key) return null;
  const hit = memory.get(key);
  if (!hit) return null;
  return {
    category: hit.category,
    confidence: hit.confidence,
    sampleSize: hit.total,
  };
}

/** Threshold the consumer should require before auto-applying a
 *  predicted category without asking the user. Above this we trust
 *  the memory; below this we surface it as a suggestion only. */
export const AUTO_APPLY_CONFIDENCE = 0.75;
export const AUTO_APPLY_MIN_SAMPLES = 3;

export function shouldAutoApply(p: Prediction | null): boolean {
  if (!p) return false;
  return (
    p.sampleSize >= AUTO_APPLY_MIN_SAMPLES &&
    p.confidence >= AUTO_APPLY_CONFIDENCE
  );
}
