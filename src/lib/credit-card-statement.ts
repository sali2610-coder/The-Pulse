// Phase 393 — canonical per-card credit statement.
//
// Single source of truth for "what does each card cost me this
// month?" — grouped by card account, with a distinct
// "unassigned" bucket for credit transactions that have no
// resolvable card.
//
// Pinned invariant:
//   total === Σ cards[i].total + unassigned.total
//
// Every credit row that getCreditCardExposure counts ends up in
// exactly ONE bucket — either a specific card or unassigned. No
// double counting, no silent drops.

import type {
  Account,
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import {
  getCreditCardExposure,
  type CreditExposureRow,
  type CreditCardExposureBucket,
} from "@/lib/credit-card-exposure";

export type CardStatement = {
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  total: number;
  transactions: CardStatementRow[];
  categoryTotals: Array<{ category: CategoryId; total: number }>;
};

export type CardStatementRow = CreditExposureRow & {
  category?: CategoryId;
};

export type CreditCardStatement = {
  monthKey: MonthKey;
  total: number;
  cards: CardStatement[];
  unassigned: {
    total: number;
    transactions: CardStatementRow[];
  };
};

function entryById(
  entries: ExpenseEntry[],
  id: string,
): ExpenseEntry | undefined {
  return entries.find((e) => e.id === id);
}

function ruleById(
  rules: RecurringRule[],
  id: string,
): RecurringRule | undefined {
  return rules.find((r) => r.id === id);
}

function refToOrigin(refId: string): { kind: "rule" | "entry"; id: string } | null {
  if (refId.startsWith("rule:")) {
    return { kind: "rule", id: refId.slice("rule:".length) };
  }
  if (refId.startsWith("entry:")) {
    return { kind: "entry", id: refId.slice("entry:".length) };
  }
  return null;
}

function findCardForEntry(
  e: ExpenseEntry,
  accounts: Account[],
): Account | null {
  if (e.accountId) {
    const matched = accounts.find(
      (a) => a.id === e.accountId && a.kind === "card",
    );
    if (matched) return matched;
  }
  if (e.cardLast4) {
    const matched = accounts.find(
      (a) => a.kind === "card" && a.cardLast4 === e.cardLast4,
    );
    if (matched) return matched;
  }
  return null;
}

function findCardForRule(
  r: RecurringRule,
  accounts: Account[],
): Account | null {
  if (r.linkedCardId) {
    const matched = accounts.find(
      (a) => a.id === r.linkedCardId && a.kind === "card",
    );
    if (matched) return matched;
  }
  return null;
}

function bucketLabel(b: CreditCardExposureBucket): string {
  switch (b) {
    case "futureCardCharges":
      return "חיוב קבוע";
    case "existingInstallments":
      return "תשלום פתוח";
    case "walletTransactions":
      return "Wallet";
    case "importedTransactions":
      return "ייבוא / SMS";
    case "manualCardTransactions":
      return "תיעוד ידני";
    case "pendingTransactions":
      return "ממתין";
  }
}
void bucketLabel;

export function getCreditCardStatement(args: {
  accounts: Account[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): CreditCardStatement {
  const exposure = getCreditCardExposure({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });

  // Map cardId → accumulator. We seed it lazily so cards that don't
  // see any credit this month don't surface as empty rows.
  type Acc = {
    cardId: string;
    cardLabel: string;
    cardLast4?: string;
    total: number;
    transactions: CardStatementRow[];
    categoryMap: Map<CategoryId, number>;
  };
  const accMap = new Map<string, Acc>();
  function ensureCard(card: Account): Acc {
    const found = accMap.get(card.id);
    if (found) return found;
    const fresh: Acc = {
      cardId: card.id,
      cardLabel: card.label || `····${card.cardLast4 ?? ""}`,
      cardLast4: card.cardLast4,
      total: 0,
      transactions: [],
      categoryMap: new Map(),
    };
    accMap.set(card.id, fresh);
    return fresh;
  }

  const unassignedRows: CardStatementRow[] = [];
  let unassignedTotal = 0;

  for (const row of exposure.breakdown) {
    const origin = refToOrigin(row.id);
    let card: Account | null = null;
    let category: CategoryId | undefined;
    if (origin?.kind === "entry") {
      const e = entryById(args.entries, origin.id);
      if (e) {
        card = findCardForEntry(e, args.accounts);
        category = e.category as CategoryId;
      }
    } else if (origin?.kind === "rule") {
      const r = ruleById(args.rules, origin.id);
      if (r) {
        card = findCardForRule(r, args.accounts);
        category = r.category as CategoryId;
      }
    }

    const enriched: CardStatementRow = { ...row, category };

    if (card) {
      const bucket = ensureCard(card);
      bucket.total += row.amount;
      bucket.transactions.push(enriched);
      if (category) {
        bucket.categoryMap.set(
          category,
          (bucket.categoryMap.get(category) ?? 0) + row.amount,
        );
      }
    } else {
      unassignedRows.push(enriched);
      unassignedTotal += row.amount;
    }
  }

  // Sort cards by total desc; transactions inside each card by
  // amount desc.
  const cards: CardStatement[] = Array.from(accMap.values())
    .map((a) => ({
      cardId: a.cardId,
      cardLabel: a.cardLabel,
      cardLast4: a.cardLast4,
      total: Math.round(a.total),
      transactions: a.transactions
        .slice()
        .sort((x, y) => y.amount - x.amount),
      categoryTotals: Array.from(a.categoryMap.entries())
        .map(([category, total]) => ({
          category,
          total: Math.round(total),
        }))
        .sort((x, y) => y.total - x.total),
    }))
    .sort((a, b) => b.total - a.total);

  const total =
    cards.reduce((s, c) => s + c.total, 0) + Math.round(unassignedTotal);

  return {
    monthKey: args.monthKey,
    total,
    cards,
    unassigned: {
      total: Math.round(unassignedTotal),
      transactions: unassignedRows.sort((x, y) => y.amount - x.amount),
    },
  };
}
