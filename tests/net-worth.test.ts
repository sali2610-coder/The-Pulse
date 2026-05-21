import { describe, expect, it } from "vitest";

import { computeNetWorth } from "@/lib/net-worth";
import type {
  Account,
  ExpenseEntry,
  Loan,
  MonthKey,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function bank(overrides: Partial<Account> = {}): Account {
  return {
    id: "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-01T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: "card-1",
    kind: "card",
    label: "CAL",
    issuer: "cal",
    cardLast4: "1234",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    label: "Car",
    monthlyInstallment: 1500,
    remainingBalance: 60000,
    endDate: "2029-12-01",
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeNetWorth", () => {
  it("returns zeros for an empty financial picture", () => {
    const nw = computeNetWorth({
      accounts: [],
      loans: [],
      entries: [],
      monthKey: MAY,
    });
    expect(nw.assets).toBe(0);
    expect(nw.totalDebt).toBe(0);
    expect(nw.netWorth).toBe(0);
  });

  it("counts positive bank balance as asset", () => {
    const nw = computeNetWorth({
      accounts: [bank({ anchorBalance: 12000 })],
      loans: [],
      entries: [],
      monthKey: MAY,
    });
    expect(nw.assets).toBe(12000);
    expect(nw.overdraft).toBe(0);
    expect(nw.netWorth).toBe(12000);
  });

  it("counts negative bank balance as overdraft debt", () => {
    const nw = computeNetWorth({
      accounts: [bank({ anchorBalance: -3000 })],
      loans: [],
      entries: [],
      monthKey: MAY,
    });
    expect(nw.assets).toBe(0);
    expect(nw.overdraft).toBe(3000);
    expect(nw.totalDebt).toBe(3000);
    expect(nw.netWorth).toBe(-3000);
  });

  it("prefers card currentDebt over cycle projection", () => {
    const nw = computeNetWorth({
      accounts: [
        card({
          currentDebt: 5000,
          billingDay: 25,
          paymentDay: 2,
        }),
      ],
      loans: [],
      entries: [
        {
          id: "e1",
          amount: 9999,
          category: "food",
          source: "sms",
          paymentMethod: "credit",
          installments: 1,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          createdAt: new Date(2026, 4, 10).toISOString(),
          accountId: "card-1",
        } as ExpenseEntry,
      ],
      monthKey: MAY,
    });
    expect(nw.cardDebt).toBe(5000);
  });

  it("falls back to cycle projection when card has no currentDebt", () => {
    const nw = computeNetWorth({
      accounts: [card({ billingDay: 25, paymentDay: 2 })],
      loans: [],
      entries: [
        {
          id: "e1",
          amount: 250,
          category: "food",
          source: "sms",
          paymentMethod: "credit",
          installments: 1,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          createdAt: new Date(2026, 4, 10).toISOString(),
          accountId: "card-1",
        } as ExpenseEntry,
      ],
      monthKey: MAY,
    });
    expect(nw.cardDebt).toBe(250);
  });

  it("sums remaining principal across active loans", () => {
    const nw = computeNetWorth({
      accounts: [],
      loans: [
        loan({
          monthlyInstallment: 1500,
          startMonth: 1,
          startYear: 2026,
          totalPayments: 12,
        }),
      ],
      entries: [],
      monthKey: MAY,
    });
    // May = month 5. Remaining = 7 + current(1) = 8 → 1500 × 8 = 12000
    expect(nw.loanDebt).toBe(12000);
  });

  it("computes net = assets − total debt with mixed signals", () => {
    const nw = computeNetWorth({
      accounts: [
        bank({ id: "b1", anchorBalance: 8000 }),
        bank({ id: "b2", anchorBalance: -500 }),
        card({ currentDebt: 2000 }),
      ],
      loans: [
        loan({
          monthlyInstallment: 1500,
          startMonth: 1,
          startYear: 2026,
          totalPayments: 12,
        }),
      ],
      entries: [],
      monthKey: MAY,
    });
    expect(nw.assets).toBe(8000);
    expect(nw.overdraft).toBe(500);
    expect(nw.cardDebt).toBe(2000);
    expect(nw.loanDebt).toBe(12000);
    expect(nw.totalDebt).toBe(14500);
    expect(nw.netWorth).toBe(-6500);
  });

  it("skips inactive accounts + loans", () => {
    const nw = computeNetWorth({
      accounts: [
        bank({ anchorBalance: 10000, active: false }),
        card({ currentDebt: 5000, active: false }),
      ],
      loans: [loan({ active: false })],
      entries: [],
      monthKey: MAY,
    });
    expect(nw.assets).toBe(0);
    expect(nw.totalDebt).toBe(0);
    expect(nw.netWorth).toBe(0);
  });
});
