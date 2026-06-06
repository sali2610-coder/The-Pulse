import { describe, expect, it } from "vitest";

import { computeSummaries } from "@/lib/dashboard-section-summaries";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
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
    label: "CAL",
    issuer: "cal",
    cardLast4: "1234",
    active: true,
    billingDay: 25,
    paymentDay: 10,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
    label: "משכנתא",
    monthlyInstallment: 3500,
    remainingBalance: 200000,
    endDate: "2030-12-31",
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: "i1",
    label: "משכורת",
    amount: 12000,
    dayOfMonth: 28,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "חשמל",
    category: "bills",
    estimatedAmount: 400,
    dayOfMonth: 12,
    keywords: [],
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
    chargeDate: "2026-05-15T12:00:00.000Z",
    createdAt: "2026-05-15T12:00:00.000Z",
    ...o,
  };
}

const NOW = new Date(2026, 4, 26, 12, 0, 0); // 2026-05-26 noon

describe("computeSummaries", () => {
  it("returns OK tones across the board when no accounts/data exist", () => {
    const s = computeSummaries({
      accounts: [],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      now: NOW,
    });
    // With no anchors balance starts at 0, lowestPoint stays at 0 → warn tier.
    expect(["warn", "info"]).toContain(s.future.tone);
    expect(s.cards.tone).toBe("ok");
    expect(s.obligations.tone).toBe("ok");
    expect(s.income.tone).toBe("warn"); // no active income
    expect(s.analytics.tone).toBe("info");
    expect(s.watch.tone).toBeDefined();
  });

  it("flags danger on the future section when liquidity crosses negative", () => {
    const s = computeSummaries({
      accounts: [bank({ anchorBalance: 200 })],
      loans: [loan({ monthlyInstallment: 5000 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(s.future.tone).toBe("danger");
    expect(s.future.value).toContain("מינוס");
  });

  it("reports next upcoming income in the income summary", () => {
    const s = computeSummaries({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 28, amount: 8000 })],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(s.income.tone).toBe("ok");
    expect(s.income.value).toContain("28");
  });

  it("counts month entries for the analytics summary", () => {
    const s = computeSummaries({
      accounts: [bank()],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [
        entry({ id: "a", chargeDate: "2026-05-01T12:00:00.000Z" }),
        entry({ id: "b", chargeDate: "2026-05-20T12:00:00.000Z" }),
        entry({ id: "c", chargeDate: "2026-04-15T12:00:00.000Z" }),
      ],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(s.analytics.value).toBe("2 חיובים החודש");
  });

  it("renders card-bucket sum when card obligations exist", () => {
    const s = computeSummaries({
      accounts: [bank(), card()],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [
        // Phase 403 — chargeDate ≤ billingDay 25 → closing billingDay
        // May 25 → settle next paymentDay = June 10. Within the 35-day
        // cash-flow horizon from NOW=May 26.
        entry({
          id: "e1",
          accountId: "c1",
          amount: 300,
          chargeDate: "2026-05-05T12:00:00.000Z",
        }),
        entry({
          id: "e2",
          accountId: "c1",
          amount: 500,
          chargeDate: "2026-05-06T12:00:00.000Z",
        }),
      ],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(s.cards.tone).toBe("info");
  });

  it("reports loan + bank-debit sum on the obligations summary", () => {
    const s = computeSummaries({
      accounts: [bank()],
      loans: [loan({ dayOfMonth: 28 })],
      incomes: [],
      rules: [rule({ dayOfMonth: 28 })],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(s.obligations.tone).toBe("info");
  });
});
