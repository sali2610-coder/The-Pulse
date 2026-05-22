// Entry search.
//
// Filters the entry log by a free-text query. Matches against
// merchant, note, category id + label, cardLast4. Ranked output:
//   3  merchant exact match
//   2  merchant prefix match / cardLast4 exact
//   1  any contains match
//
// Same-score → newer chargeDate wins. Pure compute, no React.

import type { ExpenseEntry } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { getCategory } from "@/lib/categories";

export type SearchHit = {
  entry: ExpenseEntry;
  score: number;
};

function norm(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().trim();
}

function scoreOne(entry: ExpenseEntry, q: string): number {
  if (!q) return 0;
  const merchant = norm(entry.merchant);
  const note = norm(entry.note);
  const cardLast4 = norm(entry.cardLast4);
  const catId = norm(entry.category);
  const catLabel = norm(getCategory(entry.category as CategoryId).label);

  // Merchant exact
  if (merchant && merchant === q) return 3;
  // cardLast4 exact (numeric query like "1234")
  if (cardLast4 && cardLast4 === q) return 2;
  // Merchant prefix
  if (merchant && merchant.startsWith(q)) return 2;
  // Category label or id prefix
  if (catLabel.startsWith(q) || catId.startsWith(q)) return 2;
  // Any contains across fields
  if (
    (merchant && merchant.includes(q)) ||
    (note && note.includes(q)) ||
    (cardLast4 && cardLast4.includes(q)) ||
    catLabel.includes(q) ||
    catId.includes(q)
  ) {
    return 1;
  }
  return 0;
}

export type SearchOptions = {
  /** Cap on result count. Default 50. */
  limit?: number;
  /** Skip refunds. Default false. */
  excludeRefunds?: boolean;
};

export function searchEntries(
  entries: ExpenseEntry[],
  query: string,
  opts: SearchOptions = {},
): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const limit = opts.limit ?? 50;
  const hits: SearchHit[] = [];
  for (const e of entries) {
    if (opts.excludeRefunds && e.isRefund) continue;
    const s = scoreOne(e, q);
    if (s > 0) hits.push({ entry: e, score: s });
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.chargeDate.localeCompare(a.entry.chargeDate);
  });
  return hits.slice(0, limit);
}
