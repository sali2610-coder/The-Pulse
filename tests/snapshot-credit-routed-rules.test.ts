// Phase 352 — recurring rules with paymentSource="card" must route
// through the card-commitments bucket, NOT the bank-fixed bucket.

import { describe, expect, it } from "vitest";

import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-1",
    kind: "card",
    label: "MAX Gold",
    cardLast4: "1234",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "חוג ג'ודו",
    category: "education",
    estimatedAmount: 540,
    dayOfMonth: 12,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

const NOW = new Date(2026, 5, 3, 12, 0, 0); // June 3 noon

const BASE = {
  accounts: [bank({ anchorBalance: 5000 }), card({ id: "card-1" })],
  loans: [] as Loan[],
  incomes: [] as Income[],
  entries: [] as ExpenseEntry[],
  statuses: [] as RecurringStatus[],
  monthlyBudget: 0,
};

describe("snapshot routes credit-paymentSource rules to card bucket", () => {
  it("credit rule does NOT land in fixedExpensesUntilNextMonth", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-1",
          dayOfMonth: 12,
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(540);
  });

  it("bank rule still lands in fixedExpensesUntilNextMonth", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "ארנונה",
          estimatedAmount: 320,
          paymentSource: "bank",
          dayOfMonth: 10,
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(320);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(0);
  });

  it("legacy linkedCardId-only rule also routes via card lane", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "ארנונה",
          estimatedAmount: 320,
          // paymentSource intentionally NOT set ("unknown" default).
          // linkedCardId alone signals card settlement (Phase 354).
          linkedCardId: "card-1",
          dayOfMonth: 12,
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(320);
  });

  it("undefined paymentSource defaults to bank-fixed (backward compat)", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "פלאפון",
          estimatedAmount: 99,
          dayOfMonth: 20,
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(99);
  });
});
