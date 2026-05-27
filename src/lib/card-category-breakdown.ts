// Phase 242 — per-card category breakdown.
//
// Walks `effectiveCashImpactForRule` and `effectiveCashImpactStream`
// directly (rather than re-joining the cash-flow-bucket refIds back
// to their sources) so each obligation carries its origin category
// without any string-id round-trip.
//
// Output: per-card list ordered by total, each card carries
// per-category groups split into recurring / installments / one-time.
// No new financial logic — same engines as the rest of the dashboard.

import type {
  Account,
  ExpenseEntry,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import {
  effectiveCashImpactForRule,
  effectiveCashImpactStream,
} from "@/lib/effective-cash-date";
import { monthKeyOf } from "@/lib/dates";
import type { MonthKey } from "@/types/finance";

// Local copy — cash-flow-bucket's monthsInWindow generator isn't
// exported. Yields every YYYY-MM that contains a millisecond between
// `from` and `to` (inclusive of the start month).
function* monthsInWindow(from: Date, to: Date): Generator<MonthKey> {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    yield monthKeyOf(cursor);
    cursor.setMonth(cursor.getMonth() + 1);
  }
}

export type ChargeKind = "recurring" | "installments" | "oneTime";

export type CategoryGroup = {
  category: CategoryId;
  total: number;
  recurring: number;
  installments: number;
  oneTime: number;
  items: Array<{
    label: string;
    amount: number;
    effectiveCashAt: string;
    kind: ChargeKind;
    refId: string;
  }>;
};

export type CardBreakdown = {
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  total: number;
  recurringTotal: number;
  installmentsTotal: number;
  oneTimeTotal: number;
  categories: CategoryGroup[];
  /** ISO of the next debit on this card, or null. */
  nextSettlementAt: string | null;
};

export type CardBreakdownReport = {
  cards: CardBreakdown[];
  /** Sum across every card. Sanity check. */
  totalCommitted: number;
};

const WINDOW_DAYS = 35;

const ZERO_GROUP = (category: CategoryId): CategoryGroup => ({
  category,
  total: 0,
  recurring: 0,
  installments: 0,
  oneTime: 0,
  items: [],
});

// Unused arg shape preserved for caller parity; Loans + statuses
// don't drive per-card category math but the dashboard already has
// the wiring so we keep the surface symmetric with buildCashFlowBuckets.
export function buildCardCategoryBreakdown(args: {
  accounts: Account[];
  loans: Loan[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  now?: Date;
  windowDays?: number;
}): CardBreakdownReport {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? WINDOW_DAYS);
  const horizon = new Date(now.getTime() + windowDays * 86_400_000);

  type CardAccum = {
    cardId: string;
    label: string;
    last4?: string;
    groups: Map<CategoryId, CategoryGroup>;
    nextSettlement: number | null;
  };
  const cards = new Map<string, CardAccum>();
  const cardAccountById = new Map<string, Account>();
  for (const a of args.accounts) {
    if (a.kind === "card" && a.active) cardAccountById.set(a.id, a);
  }

  function ensureCard(cardId: string): CardAccum {
    const found = cards.get(cardId);
    if (found) return found;
    const acc = cardAccountById.get(cardId);
    const fresh: CardAccum = {
      cardId,
      label: acc?.label ?? "כרטיס",
      last4: acc?.cardLast4,
      groups: new Map(),
      nextSettlement: null,
    };
    cards.set(cardId, fresh);
    return fresh;
  }

  function pushItem(args: {
    cardId: string;
    category: CategoryId;
    label: string;
    amount: number;
    effectiveCashAt: Date;
    kind: ChargeKind;
    refId: string;
  }) {
    const card = ensureCard(args.cardId);
    const grp = card.groups.get(args.category) ?? ZERO_GROUP(args.category);
    grp.total += args.amount;
    if (args.kind === "recurring") grp.recurring += args.amount;
    else if (args.kind === "installments") grp.installments += args.amount;
    else grp.oneTime += args.amount;
    grp.items.push({
      label: args.label,
      amount: args.amount,
      effectiveCashAt: args.effectiveCashAt.toISOString(),
      kind: args.kind,
      refId: args.refId,
    });
    card.groups.set(args.category, grp);
    const ts = args.effectiveCashAt.getTime();
    if (card.nextSettlement === null || ts < card.nextSettlement) {
      card.nextSettlement = ts;
    }
  }

  // 1. Recurring rules + card-linked installment-plan rules.
  const paidThisMonth = new Set(
    args.statuses
      .filter(
        (s) => s.status === "paid" && s.monthKey === monthKeyOf(now),
      )
      .map((s) => s.ruleId),
  );
  for (const rule of args.rules) {
    if (!rule.active) continue;
    for (const monthKey of monthsInWindow(now, horizon)) {
      if (
        monthKey === monthKeyOf(now) &&
        paidThisMonth.has(rule.id)
      ) {
        continue;
      }
      const impact = effectiveCashImpactForRule({
        rule,
        accounts: args.accounts,
        monthKey,
      });
      if (!impact || impact.kind !== "card" || !impact.viaCardId) continue;
      const ts = impact.effectiveCashDate.getTime();
      if (ts <= now.getTime() || ts > horizon.getTime()) continue;
      pushItem({
        cardId: impact.viaCardId,
        category: rule.category,
        label: rule.label,
        amount: impact.amount,
        effectiveCashAt: impact.effectiveCashDate,
        kind: rule.installmentTotal ? "installments" : "recurring",
        refId: `rule:${rule.id}`,
      });
    }
  }

  // 2. Card-side entries (one-shot + installment plans).
  const stream = effectiveCashImpactStream({
    entries: args.entries,
    accounts: args.accounts,
    now,
  });
  for (const impact of stream) {
    if (impact.kind !== "card" || !impact.viaCardId) continue;
    const ts = impact.effectiveCashDate.getTime();
    if (ts <= now.getTime() || ts > horizon.getTime()) continue;
    const sourceEntry = findEntryForImpact(args.entries, impact);
    if (!sourceEntry) continue;
    pushItem({
      cardId: impact.viaCardId,
      category: sourceEntry.category,
      label: sourceEntry.merchant ?? sourceEntry.note ?? "חיוב כרטיס",
      amount: impact.amount,
      effectiveCashAt: impact.effectiveCashDate,
      kind:
        sourceEntry.installments && sourceEntry.installments > 1
          ? "installments"
          : "oneTime",
      refId: `entry:${sourceEntry.id}:${impact.sliceIndex}`,
    });
  }

  // 3. Finalise + sort.
  const out: CardBreakdown[] = [];
  let totalCommitted = 0;
  for (const card of cards.values()) {
    let recurring = 0;
    let installments = 0;
    let oneTime = 0;
    let total = 0;
    const categories = [...card.groups.values()]
      .map((g) => {
        recurring += g.recurring;
        installments += g.installments;
        oneTime += g.oneTime;
        total += g.total;
        return {
          ...g,
          total: round2(g.total),
          recurring: round2(g.recurring),
          installments: round2(g.installments),
          oneTime: round2(g.oneTime),
          items: g.items.slice().sort(
            (a, b) =>
              new Date(a.effectiveCashAt).getTime() -
              new Date(b.effectiveCashAt).getTime(),
          ),
        };
      })
      .sort((a, b) => b.total - a.total);

    out.push({
      cardId: card.cardId,
      cardLabel: card.label,
      cardLast4: card.last4,
      total: round2(total),
      recurringTotal: round2(recurring),
      installmentsTotal: round2(installments),
      oneTimeTotal: round2(oneTime),
      categories,
      nextSettlementAt:
        card.nextSettlement !== null
          ? new Date(card.nextSettlement).toISOString()
          : null,
    });
    totalCommitted += total;
  }
  out.sort((a, b) => b.total - a.total);

  return {
    cards: out,
    totalCommitted: round2(totalCommitted),
  };
}

function findEntryForImpact(
  entries: ExpenseEntry[],
  impact: { purchaseDate: Date; amount: number; sliceIndex: number },
): ExpenseEntry | undefined {
  // Match by chargeDate calendar day + sliceAmount; falls back to the
  // first entry whose chargeDate matches the slice's calendar day.
  const day = impact.purchaseDate.toISOString().slice(0, 10);
  for (const e of entries) {
    if (e.chargeDate.slice(0, 10) !== day) continue;
    const sliceAmt =
      e.installments > 1 ? e.amount / e.installments : e.amount;
    if (Math.abs(sliceAmt - impact.amount) < 0.01) return e;
  }
  // Fallback — same day, ignore amount.
  return entries.find((e) => e.chargeDate.slice(0, 10) === day);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
