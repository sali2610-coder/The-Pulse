import { describe, expect, it } from "vitest";

import { savingsRateTimeline } from "@/lib/savings-rate";
import type {
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: "salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: "rent",
    category: "bills",
    estimatedAmount: 3000,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("savingsRateTimeline", () => {
  it("returns N months ending at endMonth", () => {
    const r = savingsRateTimeline({
      rules: [],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 3,
    });
    expect(r.points.map((p) => p.monthKey)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("computes rate from income - outflow", () => {
    const r = savingsRateTimeline({
      rules: [rule({ estimatedAmount: 2500 })],
      loans: [],
      incomes: [income({ amount: 10000 })],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 1,
    });
    const p = r.points[0];
    expect(p.income).toBe(10000);
    expect(p.outflow).toBe(2500);
    expect(p.net).toBe(7500);
    expect(p.rate).toBeCloseTo(0.75, 5);
  });

  it("rate -Infinity when income is 0 but outflow > 0", () => {
    const r = savingsRateTimeline({
      rules: [rule()],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].rate).toBe(-Infinity);
  });

  it("rate 0 when income + outflow both zero", () => {
    const r = savingsRateTimeline({
      rules: [],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].rate).toBe(0);
  });

  it("averageRate excludes -Infinity months", () => {
    const r = savingsRateTimeline({
      rules: [rule({ id: "r1", estimatedAmount: 2000 })],
      loans: [],
      // Only one of the 3 months has income → other 2 → -Infinity.
      // But income.active fires every month → all 3 months have income.
      // To trigger -Infinity, drop income entirely and keep outflow:
      incomes: [],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 3,
    });
    expect(r.averageRate).toBe(0); // every month -Infinity → filtered → 0
  });

  it("crosses year boundary correctly", () => {
    const r = savingsRateTimeline({
      rules: [],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      endMonth: "2026-02",
      months: 4,
    });
    expect(r.points.map((p) => p.monthKey)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("excludes inactive incomes / loans", () => {
    const r = savingsRateTimeline({
      rules: [],
      loans: [
        {
          id: "l1",
          label: "x",
          monthlyInstallment: 1000,
          dayOfMonth: 5,
          active: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        } satisfies Loan,
      ],
      incomes: [income({ amount: 5000, active: false })],
      entries: [],
      statuses: [],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].income).toBe(0);
    expect(r.points[0].outflow).toBe(0);
  });

  it("entries that fall in the month count toward outflow", () => {
    const e: ExpenseEntry = {
      id: "e1",
      amount: 800,
      category: "food",
      source: "manual",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: new Date(2026, 4, 10).toISOString(),
      createdAt: new Date(2026, 4, 10).toISOString(),
    };
    const r = savingsRateTimeline({
      rules: [],
      loans: [],
      incomes: [income({ amount: 10000 })],
      entries: [e],
      statuses: [],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].outflow).toBe(800);
    expect(r.points[0].rate).toBeCloseTo((10000 - 800) / 10000, 5);
  });
});
