// Phase 242 — per-card category breakdown verification.

import { describe, expect, it } from "vitest";

import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-26T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: "c1",
    kind: "card",
    label: "Isracard",
    issuer: "isracard",
    cardLast4: "1234",
    active: true,
    billingDay: 25,
    paymentDay: 10,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Spotify",
    category: "entertainment",
    estimatedAmount: 30,
    dayOfMonth: 12,
    keywords: [],
    paymentSource: "card",
    linkedCardId: "c1",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-26T12:00:00.000Z",
    createdAt: "2026-05-26T12:00:00.000Z",
    accountId: "c1",
    ...o,
  };
}

const NOW = new Date(2026, 4, 26, 12, 0, 0);

describe("buildCardCategoryBreakdown", () => {
  it("returns empty when no card buckets exist", () => {
    const r = buildCardCategoryBreakdown({
      accounts: [bank()],
      loans: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
    });
    expect(r.cards).toHaveLength(0);
    expect(r.totalCommitted).toBe(0);
  });

  it("groups multiple cards independently — Isracard vs CAL", () => {
    const r = buildCardCategoryBreakdown({
      accounts: [
        bank(),
        card({ id: "c1", label: "Isracard" }),
        card({ id: "c2", label: "CAL", issuer: "cal" }),
      ],
      loans: [],
      rules: [
        rule({ id: "r1", linkedCardId: "c1", estimatedAmount: 30 }),
        rule({
          id: "r2",
          linkedCardId: "c2",
          estimatedAmount: 90,
          category: "bills",
        }),
      ],
      statuses: [],
      entries: [],
      now: NOW,
    });
    const byId = new Map(r.cards.map((c) => [c.cardId, c]));
    expect(byId.get("c1")?.total).toBe(30);
    expect(byId.get("c2")?.total).toBe(90);
    // Each card keeps its OWN totals — no merge.
    expect(byId.get("c1")?.categories.map((g) => g.category)).toEqual([
      "entertainment",
    ]);
    expect(byId.get("c2")?.categories.map((g) => g.category)).toEqual([
      "bills",
    ]);
  });

  it("splits totals into recurring / installments / one-time", () => {
    const r = buildCardCategoryBreakdown({
      accounts: [bank(), card()],
      loans: [],
      rules: [
        // recurring rule (no installmentTotal → kind "recurring")
        rule({ id: "rc", category: "bills", estimatedAmount: 200 }),
        // installment-plan rule (installmentTotal → kind "installment")
        rule({
          id: "ri",
          category: "health",
          estimatedAmount: 100,
          installmentTotal: 6,
          dayOfMonth: 12,
        }),
      ],
      statuses: [],
      entries: [
        // card-entry → kind "oneTime"
        entry({
          id: "e1",
          accountId: "c1",
          amount: 250,
          category: "food",
          chargeDate: "2026-05-27T12:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    const c = r.cards[0];
    expect(c.recurringTotal).toBe(200);
    expect(c.installmentsTotal).toBe(100);
    expect(c.oneTimeTotal).toBe(250);
    expect(c.total).toBe(550);
  });

  it("category total equals sum of recurring + installments + oneTime", () => {
    const r = buildCardCategoryBreakdown({
      accounts: [bank(), card()],
      loans: [],
      rules: [
        rule({
          id: "r-bills",
          category: "bills",
          estimatedAmount: 300,
          dayOfMonth: 12,
        }),
        rule({
          id: "r-bills-inst",
          category: "bills",
          estimatedAmount: 120,
          dayOfMonth: 14,
          installmentTotal: 6,
        }),
      ],
      statuses: [],
      entries: [
        entry({
          id: "e1",
          accountId: "c1",
          category: "bills",
          amount: 80,
          chargeDate: "2026-05-28T12:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    const c = r.cards[0];
    const bills = c.categories.find((g) => g.category === "bills");
    if (!bills) throw new Error("missing bills");
    expect(bills.recurring).toBe(300);
    expect(bills.installments).toBe(120);
    expect(bills.oneTime).toBe(80);
    expect(bills.total).toBe(500);
  });

  it("sorts cards by total descending", () => {
    const r = buildCardCategoryBreakdown({
      accounts: [
        bank(),
        card({ id: "c-small", label: "Small" }),
        card({ id: "c-big", label: "Big" }),
      ],
      loans: [],
      rules: [
        rule({
          id: "r-small",
          linkedCardId: "c-small",
          estimatedAmount: 50,
        }),
        rule({
          id: "r-big",
          linkedCardId: "c-big",
          estimatedAmount: 500,
        }),
      ],
      statuses: [],
      entries: [],
      now: NOW,
    });
    expect(r.cards.map((c) => c.cardId)).toEqual(["c-big", "c-small"]);
  });
});
