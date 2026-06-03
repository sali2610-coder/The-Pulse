// Phase 349 — credit purchases must NOT hit the bank on the day
// they happen; they should sit in `pendingCardUntilCycle` until the
// card's billing day.

import { describe, expect, it } from "vitest";

import { buildBudgetControlBreakdown } from "@/lib/budget-control";
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
    label: "Hi-Tech Zone",
    cardLast4: "1234",
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
    amount: 100,
    category: "supermarket",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 5, 3, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 5, 3, 12, 0, 0).toISOString(),
    ...o,
  };
}

const NOW = new Date(2026, 5, 3, 12, 0, 0); // June 3 noon
const BASE = {
  accounts: [bank({ anchorBalance: 5000 }), card({ id: "card-1" })],
  loans: [] as Loan[],
  incomes: [] as Income[],
  rules: [] as RecurringRule[],
  statuses: [] as RecurringStatus[],
};

describe("budget-control with credit purchases", () => {
  it("today's ₪100 credit buy is NOT deducted from bank today", () => {
    const result = buildBudgetControlBreakdown({
      ...BASE,
      entries: [
        entry({
          amount: 100,
          paymentMethod: "credit",
          accountId: "card-1",
          chargeDate: NOW.toISOString(),
        }),
      ],
      now: NOW,
    });
    // The buy hits the card's payment day (July 2) — within the
    // 35-day cycle window. Show up in pendingCardUntilCycle.
    expect(result.pendingCardUntilCycle).toBe(100);
    // Bank balance untouched.
    expect(result.bankBalance).toBe(5000);
  });

  it("a future-dated cash entry is still counted as a pending debit", () => {
    const result = buildBudgetControlBreakdown({
      ...BASE,
      entries: [
        entry({
          amount: 250,
          paymentMethod: "cash",
          accountId: "bank-1",
          chargeDate: new Date(2026, 5, 10, 12, 0, 0).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(result.pendingCardUntilCycle).toBeGreaterThanOrEqual(250);
  });

  it("a refund credit does NOT add to pendingCard", () => {
    const result = buildBudgetControlBreakdown({
      ...BASE,
      entries: [
        entry({
          amount: 80,
          paymentMethod: "credit",
          isRefund: true,
          accountId: "card-1",
          chargeDate: NOW.toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(result.pendingCardUntilCycle).toBe(0);
  });
});
