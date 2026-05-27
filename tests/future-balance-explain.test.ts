// Phase 239+240 — verify the future-balance breakdown.
//
// Confirms every requirement from the brief is wired:
//   starting bank balance + income − cards − bank fixed − loans
// And that pending entries that the engine skips are surfaced via
// excludedPendingCount / excludedPendingTotal so the user knows
// why the figure differs from naive expectations.

import { describe, expect, it } from "vitest";

import { buildFutureBalanceBreakdown } from "@/lib/future-balance-explain";
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
    paymentSource: "bank",
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
    ...o,
  };
}

const NOW = new Date(2026, 4, 26, 12, 0, 0); // 2026-05-26 noon

describe("buildFutureBalanceBreakdown", () => {
  it("returns the starting balance as the only line when no events fire", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 3000 })],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      offset: 30,
      now: NOW,
    });
    expect(out.startingBalance).toBe(3000);
    expect(out.income).toBe(0);
    expect(out.cardSettlements).toBe(0);
    expect(out.bankFixed).toBe(0);
    expect(out.loans).toBe(0);
    expect(out.projectedBalance).toBe(3000);
  });

  it("includes salary income before the snapshot date", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 1000 })],
      loans: [],
      incomes: [income({ amount: 12000, dayOfMonth: 28 })],
      rules: [],
      statuses: [],
      entries: [],
      offset: 5,
      now: NOW,
    });
    expect(out.income).toBe(12000);
    expect(out.projectedBalance).toBe(13000);
  });

  it("subtracts loan installments that fall inside the window", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 10000 })],
      loans: [loan({ monthlyInstallment: 3500, dayOfMonth: 5 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      offset: 30,
      now: NOW,
    });
    expect(out.loans).toBe(3500);
    expect(out.projectedBalance).toBe(6500);
  });

  it("subtracts bank-side recurring rules", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 2000 })],
      loans: [],
      incomes: [],
      rules: [rule({ estimatedAmount: 400, dayOfMonth: 28 })],
      statuses: [],
      entries: [],
      offset: 10,
      now: NOW,
    });
    expect(out.bankFixed).toBe(400);
    expect(out.projectedBalance).toBe(1600);
  });

  it("subtracts credit-card settlements on the card payment day", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 5000 }), card()],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [
        entry({
          id: "e1",
          accountId: "c1",
          amount: 1200,
          chargeDate: "2026-05-26T12:00:00.000Z",
        }),
      ],
      offset: 30,
      now: NOW,
    });
    expect(out.cardSettlements).toBe(1200);
    expect(out.projectedBalance).toBe(3800);
  });

  it("flags pending entries that the engine skipped", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 1000 })],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [
        entry({
          id: "p1",
          amount: 200,
          chargeDate: "2026-06-02T12:00:00.000Z",
          bankPending: true,
        }),
        entry({
          id: "p2",
          amount: 50,
          chargeDate: "2026-06-04T12:00:00.000Z",
          needsConfirmation: true,
        }),
      ],
      offset: 14,
      now: NOW,
    });
    expect(out.excludedPendingCount).toBe(2);
    expect(out.excludedPendingTotal).toBe(250);
    // Pending entries do NOT enter the projected balance — the curve
    // engine deliberately skips them.
    expect(out.projectedBalance).toBe(1000);
  });

  it("composes income + loans + cards into one figure", () => {
    const out = buildFutureBalanceBreakdown({
      accounts: [bank({ anchorBalance: 4000 }), card()],
      loans: [loan({ monthlyInstallment: 1500, dayOfMonth: 5 })],
      incomes: [income({ amount: 12000, dayOfMonth: 28 })],
      rules: [rule({ estimatedAmount: 600, dayOfMonth: 1 })],
      statuses: [],
      entries: [
        entry({
          id: "e1",
          accountId: "c1",
          amount: 2400,
          chargeDate: "2026-05-26T12:00:00.000Z",
        }),
      ],
      offset: 30,
      now: NOW,
    });
    expect(out.income).toBe(12000);
    expect(out.cardSettlements).toBe(2400);
    expect(out.bankFixed).toBe(600);
    expect(out.loans).toBe(1500);
    // 4000 + 12000 - 2400 - 600 - 1500 = 11500
    expect(out.projectedBalance).toBe(11500);
  });
});
