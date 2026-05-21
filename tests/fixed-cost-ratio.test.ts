import { describe, expect, it } from "vitest";

import { computeFixedCostRatio } from "@/lib/fixed-cost-ratio";
import type {
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function income(overrides: Partial<Income> = {}): Income {
  return {
    id: "i1",
    label: "Salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Rent",
    category: "bills",
    estimatedAmount: 3000,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
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

describe("computeFixedCostRatio", () => {
  it("returns null when no active income", () => {
    expect(
      computeFixedCostRatio({
        rules: [rule()],
        loans: [],
        incomes: [income({ active: false })],
        statuses: [],
        monthKey: MAY,
      }),
    ).toBeNull();
  });

  it("computes ratio across rules + loans", () => {
    const r = computeFixedCostRatio({
      rules: [rule()],
      loans: [loan()],
      incomes: [income()],
      statuses: [],
      monthKey: MAY,
    })!;
    expect(r.recurringFixed).toBe(3000);
    expect(r.loanFixed).toBe(1500);
    expect(r.totalFixed).toBe(4500);
    expect(r.ratio).toBeCloseTo(0.45, 2);
    expect(r.severity).toBe("watch");
    expect(r.variableHeadroom).toBe(5500);
  });

  it("uses actual paid amount over estimated when rule has matched", () => {
    const status: RecurringStatus = {
      ruleId: "r1",
      monthKey: MAY,
      status: "paid",
      actualAmount: 3200,
    };
    const r = computeFixedCostRatio({
      rules: [rule()],
      loans: [],
      incomes: [income()],
      statuses: [status],
      monthKey: MAY,
    })!;
    expect(r.recurringFixed).toBe(3200);
  });

  it("classifies severity bands", () => {
    const cases: Array<[number, FixedCostRatio["severity"]]> = [
      [3000, "calm"],
      [4500, "watch"],
      [6000, "warn"],
      [8000, "alert"],
    ];
    for (const [fixed, expected] of cases) {
      const r = computeFixedCostRatio({
        rules: [rule({ estimatedAmount: fixed })],
        loans: [],
        incomes: [income({ amount: 10000 })],
        statuses: [],
        monthKey: MAY,
      })!;
      expect(r.severity).toBe(expected);
    }
  });

  it("skips inactive rules + loans + completed installment plans", () => {
    const r = computeFixedCostRatio({
      rules: [rule({ active: false })],
      loans: [loan({ active: false })],
      incomes: [income()],
      statuses: [],
      monthKey: MAY,
    })!;
    expect(r.totalFixed).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.severity).toBe("calm");
  });
});

type FixedCostRatio = NonNullable<
  ReturnType<typeof computeFixedCostRatio>
>;
