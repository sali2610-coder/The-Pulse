import { describe, expect, it } from "vitest";
import { forecastByAccount } from "@/lib/forecast";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
} from "@/types/finance";

const NOW = new Date(2026, 4, 1, 9, 0, 0); // May 1

function bank(label: string, balance: number, id = `bank-${label}`): Account {
  return {
    id,
    kind: "bank",
    label,
    anchorBalance: balance,
    anchorUpdatedAt: new Date(2026, 4, 1).toISOString(),
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 20).toISOString(),
    createdAt: new Date(2026, 4, 20).toISOString(),
    ...overrides,
  };
}

describe("forecastByAccount", () => {
  it("returns one entry per active bank with anchor preserved", () => {
    const out = forecastByAccount({
      accounts: [bank("Main", 5000), bank("Side", 1000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    expect(out.length).toBe(2);
    expect(out[0].forecast).toBe(5000);
    expect(out[1].forecast).toBe(1000);
  });

  it("splits shared incomes proportionally to positive anchors", () => {
    const incomes: Income[] = [
      {
        id: "i",
        label: "Salary",
        amount: 6000,
        dayOfMonth: 10,
        active: true,
        createdAt: NOW.toISOString(),
      },
    ];
    const out = forecastByAccount({
      accounts: [bank("Main", 3000), bank("Side", 1000)],
      loans: [],
      incomes,
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    // weights: 3/4 + 1/4 → +4500 / +1500
    expect(out[0].expectedIncome).toBe(4500);
    expect(out[0].forecast).toBe(7500);
    expect(out[1].expectedIncome).toBe(1500);
    expect(out[1].forecast).toBe(2500);
  });

  it("routes accountId-bound entries to their direct account", () => {
    const e: ExpenseEntry = entry({
      id: "e1",
      amount: 800,
      accountId: "bank-Side",
      chargeDate: new Date(2026, 4, 20).toISOString(),
    });
    const out = forecastByAccount({
      accounts: [bank("Main", 1000), bank("Side", 1000)],
      loans: [],
      incomes: [],
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    // Only "Side" gets the 800 future slice.
    expect(out[0].futureCardSlices).toBe(0);
    expect(out[1].futureCardSlices).toBe(800);
    expect(out[0].forecast).toBe(1000);
    expect(out[1].forecast).toBe(200);
  });

  it("flags goesNegative when projection dips below zero", () => {
    const loans: Loan[] = [
      {
        id: "l",
        label: "Car",
        monthlyInstallment: 2000,
        remainingBalance: 24000,
        endDate: new Date(2028, 0, 1).toISOString(),
        dayOfMonth: 5,
        active: true,
        createdAt: NOW.toISOString(),
      },
    ];
    const out = forecastByAccount({
      accounts: [bank("Main", 1500)],
      loans,
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    expect(out[0].forecast).toBe(-500);
    expect(out[0].goesNegative).toBe(true);
  });

  it("falls back to even split when all anchors ≤ 0", () => {
    const incomes: Income[] = [
      {
        id: "i",
        label: "Salary",
        amount: 1000,
        dayOfMonth: 10,
        active: true,
        createdAt: NOW.toISOString(),
      },
    ];
    const out = forecastByAccount({
      accounts: [bank("A", -100), bank("B", -200)],
      loans: [],
      incomes,
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    expect(out[0].expectedIncome).toBe(500);
    expect(out[1].expectedIncome).toBe(500);
  });
});
