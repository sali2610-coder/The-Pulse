// Phase 268 — monthly cashflow grouping. Locks the contract that
// June + July events never merge into one scary block — each month
// is its own folder with per-source breakdown.

import { describe, expect, it } from "vitest";

import { buildMonthlyCashflow } from "@/lib/monthly-cashflow";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 5, 3, 12, 0, 0); // 2026-06-03

function bank(): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: NOW.toISOString(),
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: "i-salary",
    label: "משכורת",
    amount: 12000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: "l-mortgage",
    label: "משכנתא",
    monthlyInstallment: 3500,
    remainingBalance: 200_000,
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

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r-electric",
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

describe("buildMonthlyCashflow", () => {
  it("returns a folder per month inside the window", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [loan()],
      incomes: [income()],
      rules: [rule()],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 90,
    });
    const months = folders.map((f) => f.monthKey);
    expect(months).toContain("2026-06");
    expect(months).toContain("2026-07");
    expect(months).toContain("2026-08");
  });

  it("never merges months — June and July are separate folders", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 28 })], // June 28 + July 28
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 60,
    });
    const jun = folders.find((f) => f.monthKey === "2026-06");
    const jul = folders.find((f) => f.monthKey === "2026-07");
    expect(jun).toBeDefined();
    expect(jul).toBeDefined();
    expect(jun?.monthKey).not.toBe(jul?.monthKey);
    expect(jun?.totalIncome).toBeGreaterThan(0);
    expect(jul?.totalIncome).toBeGreaterThan(0);
  });

  it("classifies tone correctly: current / next / future", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 28 })], // June 28 emits in current
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 120,
    });
    expect(folders[0].tone).toBe("current");
    expect(folders[1].tone).toBe("next");
    if (folders[2]) expect(folders[2].tone).toBe("future");
  });

  it("splits sources per-folder: income / bank / cards / loans", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [loan({ dayOfMonth: 5 })], // June 5 + July 5
      incomes: [income({ dayOfMonth: 1 })], // July 1
      rules: [rule({ dayOfMonth: 12 })], // June 12 + July 12
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 60,
    });
    const jun = folders.find((f) => f.monthKey === "2026-06");
    if (!jun) throw new Error("missing June");
    expect(jun.bySource.bank_debit.total).toBe(400);
    expect(jun.bySource.loan.total).toBe(3500);
    expect(jun.bySource.income.total).toBe(0); // July 1 is in next folder
    expect(jun.bySource.card.total).toBe(0);
  });

  it("net = totalIncome − totalExpense per folder", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [loan({ monthlyInstallment: 1000, dayOfMonth: 5 })],
      incomes: [income({ amount: 12000, dayOfMonth: 28 })],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 60,
    });
    const jun = folders.find((f) => f.monthKey === "2026-06");
    if (!jun) throw new Error("missing June");
    // June: salary 12000 - loan 1000 = 11000
    expect(jun.totalIncome).toBe(12000);
    expect(jun.totalExpense).toBe(1000);
    expect(jun.net).toBe(11000);
  });

  it("returns folders sorted chronologically", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [],
      incomes: [income()],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 90,
    });
    const keys = folders.map((f) => f.monthKey);
    expect([...keys].sort()).toEqual(keys);
  });

  it("hebrew label uses month name + year", () => {
    const folders = buildMonthlyCashflow({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 28 })],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 60,
    });
    const jun = folders.find((f) => f.monthKey === "2026-06");
    expect(jun?.fullLabel).toBe("יוני 2026");
  });

  it("returns empty array when nothing fires in the window", () => {
    const folders = buildMonthlyCashflow({
      accounts: [],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 60,
    });
    expect(folders).toEqual([]);
  });

  it("entry slices count as card-source events in their effective month", () => {
    const e: ExpenseEntry = {
      id: "e1",
      amount: 600,
      category: "shopping",
      source: "manual",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: "2026-06-26T12:00:00.000Z",
      createdAt: "2026-06-26T12:00:00.000Z",
      accountId: "c1",
    };
    const accounts: Account[] = [
      bank(),
      {
        id: "c1",
        kind: "card",
        label: "Isracard",
        issuer: "isracard",
        cardLast4: "1234",
        billingDay: 25,
        paymentDay: 10,
        active: true,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ];
    const folders = buildMonthlyCashflow({
      accounts,
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [e],
      now: NOW,
      windowDays: 90,
    });
    const cardTotals = folders.map((f) => ({
      key: f.monthKey,
      card: f.bySource.card.total,
    }));
    // Exactly one month carries the 600 card slice; others have 0.
    const nonZero = cardTotals.filter((c) => c.card > 0);
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0].card).toBe(600);
  });
});
