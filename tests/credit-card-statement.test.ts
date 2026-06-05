// Phase 393 — per-card statement contract.
//
// Invariants:
//   1. total === Σ cards[i].total + unassigned.total
//   2. Every credit transaction with an accountId pointing at a
//      known card lands in THAT card's transactions array.
//   3. Card-settled rules with linkedCardId land in the linked
//      card's transactions array.
//   4. Credit transactions with no resolvable card land in
//      unassigned.
//   5. An entry that maps to a card account is NEVER labelled
//      unassigned.

import { describe, expect, it } from "vitest";

import { getCreditCardStatement } from "@/lib/credit-card-statement";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;
const MONTH_DATE = new Date(2026, 5, 10, 12, 0, 0).toISOString();

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 10_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-htz",
    kind: "card",
    label: "Hi-Tech Zone",
    cardLast4: "7093",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: MONTH_DATE,
    createdAt: MONTH_DATE,
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "education",
    estimatedAmount: 540,
    dayOfMonth: 12,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("getCreditCardStatement", () => {
  it("manual credit entry with accountId → lands in that card's transactions", () => {
    const htz = card({ id: "card-htz" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz],
      rules: [],
      entries: [
        entry({
          id: "e-wolt",
          source: "manual",
          merchant: "Wolt",
          amount: 284,
          accountId: "card-htz",
        }),
        entry({
          id: "e-super",
          source: "manual",
          merchant: "שופרסל",
          amount: 524,
          accountId: "card-htz",
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(stmt.cards).toHaveLength(1);
    expect(stmt.cards[0].cardId).toBe("card-htz");
    expect(stmt.cards[0].total).toBe(284 + 524);
    expect(stmt.cards[0].transactions.map((t) => t.id)).toEqual(
      expect.arrayContaining(["entry:e-wolt", "entry:e-super"]),
    );
    expect(stmt.unassigned.total).toBe(0);
  });

  it("card-settled rule with linkedCardId → lands in that card's transactions", () => {
    const htz = card({ id: "card-htz" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz],
      rules: [
        rule({
          id: "r-judo",
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-htz",
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(stmt.cards).toHaveLength(1);
    expect(stmt.cards[0].cardId).toBe("card-htz");
    expect(stmt.cards[0].total).toBe(540);
    expect(stmt.cards[0].transactions[0].id).toBe("rule:r-judo");
  });

  it("credit entry with NO accountId AND no matching card → unassigned bucket", () => {
    const stmt = getCreditCardStatement({
      accounts: [bank()], // no card account at all
      rules: [],
      entries: [
        entry({
          id: "e-orphan",
          source: "wallet",
          merchant: "Apple Pay",
          amount: 99,
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(stmt.cards).toHaveLength(0);
    expect(stmt.unassigned.total).toBe(99);
    expect(stmt.unassigned.transactions[0].id).toBe("entry:e-orphan");
  });

  it("total = Σ cards.total + unassigned.total — invariant pinned", () => {
    const htz = card({ id: "card-htz" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz],
      rules: [
        rule({
          id: "r-judo",
          paymentSource: "card",
          linkedCardId: "card-htz",
          estimatedAmount: 540,
        }),
      ],
      entries: [
        entry({
          id: "e-htz-wolt",
          accountId: "card-htz",
          merchant: "Wolt",
          amount: 284,
        }),
        entry({
          id: "e-orphan",
          source: "wallet",
          amount: 99,
          // No accountId → unassigned.
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    const cardsSum = stmt.cards.reduce((s, c) => s + c.total, 0);
    expect(stmt.total).toBe(cardsSum + stmt.unassigned.total);
  });

  it("entry with accountId that resolves is NEVER labelled unassigned", () => {
    const htz = card({ id: "card-htz" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz],
      rules: [],
      entries: [
        entry({ id: "e-1", accountId: "card-htz", amount: 100 }),
        entry({ id: "e-2", accountId: "card-htz", amount: 200 }),
        entry({ id: "e-3", accountId: "card-htz", amount: 300 }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(stmt.unassigned.transactions).toHaveLength(0);
    expect(stmt.unassigned.total).toBe(0);
    expect(stmt.cards[0].transactions).toHaveLength(3);
  });

  it("entry.cardLast4 fallback also resolves card without accountId", () => {
    const htz = card({ id: "card-htz", cardLast4: "7093" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz],
      rules: [],
      entries: [
        entry({
          id: "e-sms",
          source: "sms",
          cardLast4: "7093",
          amount: 80,
          // No explicit accountId.
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(stmt.cards).toHaveLength(1);
    expect(stmt.cards[0].cardId).toBe("card-htz");
    expect(stmt.unassigned.total).toBe(0);
  });

  it("multiple cards: each transaction grouped under its own card", () => {
    const htz = card({ id: "card-htz", label: "Hi-Tech Zone" });
    const max = card({ id: "card-max", label: "MAX", cardLast4: "1234" });
    const stmt = getCreditCardStatement({
      accounts: [bank(), htz, max],
      rules: [],
      entries: [
        entry({ id: "e-1", accountId: "card-htz", amount: 100 }),
        entry({ id: "e-2", accountId: "card-max", amount: 250 }),
        entry({ id: "e-3", accountId: "card-htz", amount: 50 }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    const htzCard = stmt.cards.find((c) => c.cardId === "card-htz");
    const maxCard = stmt.cards.find((c) => c.cardId === "card-max");
    expect(htzCard?.total).toBe(150);
    expect(maxCard?.total).toBe(250);
    expect(stmt.total).toBe(400);
  });
});
