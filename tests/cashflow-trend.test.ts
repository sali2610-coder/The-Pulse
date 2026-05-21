import { describe, expect, it } from "vitest";

import { cashflowTrend } from "@/lib/cashflow-trend";
import type {
  ExpenseEntry,
  Income,
  MonthKey,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    ...overrides,
  };
}

function income(overrides: Partial<Income> = {}): Income {
  return {
    id: "i-1",
    label: "Salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("cashflowTrend", () => {
  it("returns lookback months ordered oldest → newest", () => {
    const trend = cashflowTrend({
      entries: [],
      incomes: [income()],
      monthKey: MAY,
      lookback: 3,
    });
    expect(trend.months).toHaveLength(3);
    expect(trend.months[0].monthKey).toBe("2026-03");
    expect(trend.months[1].monthKey).toBe("2026-04");
    expect(trend.months[2].monthKey).toBe("2026-05");
  });

  it("computes net + savingsRate per month", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 3000,
      }),
    ];
    const trend = cashflowTrend({
      entries,
      incomes: [income({ amount: 10000 })],
      monthKey: MAY,
      lookback: 2,
    });
    const may = trend.months[1];
    expect(may.income).toBe(10000);
    expect(may.expense).toBe(3000);
    expect(may.net).toBe(7000);
    expect(may.savingsRate).toBeCloseTo(0.7, 2);
  });

  it("returns savingsRate=null when income is zero", () => {
    const trend = cashflowTrend({
      entries: [],
      incomes: [income({ active: false })],
      monthKey: MAY,
      lookback: 1,
    });
    expect(trend.months[0].savingsRate).toBeNull();
    expect(trend.averageSavingsRate).toBeNull();
  });

  it("excludes refunds + excludeFromBudget + needsConfirmation + bankPending", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 1000,
        isRefund: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 1000,
        excludeFromBudget: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 1000,
        needsConfirmation: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 1000,
        bankPending: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 250,
      }),
    ];
    const trend = cashflowTrend({
      entries,
      incomes: [income()],
      monthKey: MAY,
      lookback: 1,
    });
    expect(trend.months[0].expense).toBe(250);
  });

  it("identifies best + worst months", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 1000,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 9000,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 4000,
      }),
    ];
    const trend = cashflowTrend({
      entries,
      incomes: [income()],
      monthKey: MAY,
      lookback: 3,
    });
    expect(trend.bestMonth?.monthKey).toBe("2026-03");
    expect(trend.worstMonth?.monthKey).toBe("2026-04");
  });

  it("ignores inactive incomes", () => {
    const trend = cashflowTrend({
      entries: [],
      incomes: [
        income({ id: "active", amount: 7000 }),
        income({ id: "inactive", amount: 999, active: false }),
      ],
      monthKey: MAY,
      lookback: 1,
    });
    expect(trend.months[0].income).toBe(7000);
  });
});
