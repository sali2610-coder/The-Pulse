// Phase 339 — merchant suggestions per category.
//
// Walks the entry history, picks the merchant names the user has
// previously typed (or that arrived from SMS / Wallet) for the
// passed-in category, ranks them by a (recency + frequency) score,
// and returns the top N as chip suggestions. Strict de-dup on a
// canonical key so "Amir", " amir ", "אמיר " all collapse to one.
//
// Pure compute. Same data flow every chart already consumes — entry
// list from Zustand → suggestions.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry } from "@/types/finance";
import { merchantKey } from "@/lib/sanitize";

const DEFAULT_LIMIT = 6;
const RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type MerchantSuggestion = {
  /** Display label — the most recent original spelling the user
   *  actually used. */
  label: string;
  /** Canonical key (sanitize.merchantKey) for dedup. */
  key: string;
  /** Last time this merchant appeared in this category. */
  lastUsedAt: number;
  /** Raw occurrence count. */
  count: number;
};

function effectiveLabel(e: ExpenseEntry): string | null {
  // Prefer merchant (typed in the form / extracted from SMS); fall back
  // to a trimmed note when the user only filled the note field.
  const raw = (e.merchant ?? e.note ?? "").trim();
  if (!raw) return null;
  return raw;
}

function timestampOf(e: ExpenseEntry): number {
  const iso = e.chargeDate ?? e.createdAt;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function buildMerchantSuggestions(args: {
  entries: ExpenseEntry[];
  category: CategoryId | undefined;
  now?: number;
  limit?: number;
}): MerchantSuggestion[] {
  if (!args.category) return [];
  const now = args.now ?? Date.now();
  const limit = args.limit ?? DEFAULT_LIMIT;

  const byKey = new Map<string, MerchantSuggestion>();
  for (const e of args.entries) {
    if (e.category !== args.category) continue;
    if (e.excludeFromBudget) continue;
    const label = effectiveLabel(e);
    if (!label) continue;
    const key = merchantKey(label);
    if (!key) continue;
    const ts = timestampOf(e);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { label, key, lastUsedAt: ts, count: 1 });
      continue;
    }
    prev.count += 1;
    if (ts > prev.lastUsedAt) {
      prev.lastUsedAt = ts;
      // Keep the most-recent spelling so casing edits propagate.
      prev.label = label;
    }
  }

  const candidates = [...byKey.values()];
  candidates.sort((a, b) => {
    const ra = recencyScore(a.lastUsedAt, now);
    const rb = recencyScore(b.lastUsedAt, now);
    const wa = ra + Math.log1p(a.count);
    const wb = rb + Math.log1p(b.count);
    if (wb !== wa) return wb - wa;
    return b.lastUsedAt - a.lastUsedAt;
  });
  return candidates.slice(0, limit);
}

function recencyScore(lastUsedAt: number, now: number): number {
  if (!lastUsedAt) return 0;
  const age = Math.max(0, now - lastUsedAt);
  // exponential decay; 1.0 at "just now", ~0.5 after 14 days.
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);
}
