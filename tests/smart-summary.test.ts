import { describe, expect, it } from "vitest";

import { buildSmartSummary } from "@/lib/smart-summary";
import type { FinancialSnapshot } from "@/lib/financial-snapshot";
import type { Income, Loan } from "@/types/finance";

function snap(overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    generatedAt: "2026-05-10T08:00:00.000Z",
    monthKey: "2026-05",
    today: 10,
    daysRemainingInMonth: 22,
    currentBalance: 5000,
    expectedIncomeUntilNextMonth: 0,
    fixedExpensesUntilNextMonth: 0,
    installmentPaymentsUntilNextMonth: 0,
    activeLoansPaymentsUntilNextMonth: 0,
    recurringCommitmentsUntilNextMonth: 0,
    actualSpentThisMonth: 0,
    monthlyBudget: 0,
    remainingBudgetThisMonth: 0,
    remainingPlannedSpending: 0,
    projectedBalanceOnFirstOfNextMonth: 5000,
    projectedBalanceWithoutDiscretionary: 5000,
    expectedOverdraft: 0,
    safeToSpendUntilMonthEnd: 5000,
    dailySafeToSpend: 220,
    riskLevel: "safe",
    ...overrides,
  };
}

function income(amount: number, day: number, label = "salary"): Income {
  return {
    id: `inc-${day}`,
    label,
    amount,
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function loan(amount: number, label = "car"): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: amount,
    remainingBalance: 50_000,
    endDate: "2030-01-01",
    dayOfMonth: 5,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

describe("buildSmartSummary", () => {
  it("emits a positive headline when the snapshot is healthy", () => {
    const lines = buildSmartSummary({
      snapshot: snap(),
      incomes: [],
      loans: [],
    });
    expect(lines[0].tone).toBe("positive");
    expect(lines[0].text).toContain("יציב");
  });

  it("emits a watch headline when overdraft is fully covered by upcoming salary", () => {
    const lines = buildSmartSummary({
      snapshot: snap({
        expectedOverdraft: 800,
        expectedIncomeUntilNextMonth: 10_000,
        riskLevel: "overdraft",
        projectedBalanceOnFirstOfNextMonth: -800,
      }),
      incomes: [income(10_000, 25)],
      loans: [],
      today: new Date("2026-05-10T08:00:00.000Z"),
    });
    expect(lines[0].tone).toBe("watch");
    expect(lines[0].text).toContain("המשכורת");
    expect(lines[0].text).toContain("תכסה");
  });

  it("emits a danger headline when salary cannot cover overdraft", () => {
    const lines = buildSmartSummary({
      snapshot: snap({
        expectedOverdraft: 5000,
        expectedIncomeUntilNextMonth: 1000,
        riskLevel: "overdraft",
        projectedBalanceOnFirstOfNextMonth: -5000,
      }),
      incomes: [income(1000, 25)],
      loans: [],
      today: new Date("2026-05-10T08:00:00.000Z"),
    });
    expect(lines[0].tone).toBe("danger");
  });

  it("flags a heavy loan when it exceeds 25% of monthly income", () => {
    const lines = buildSmartSummary({
      snapshot: snap(),
      incomes: [income(10_000, 10, "salary")],
      loans: [loan(3000, "car")],
    });
    const loanLine = lines.find((l) => l.text.includes("car"));
    expect(loanLine).toBeDefined();
    expect(loanLine?.tone).toBe("warn");
  });

  it("uses a calm tone when a loan is between 10% and 25% of income", () => {
    const lines = buildSmartSummary({
      snapshot: snap(),
      incomes: [income(10_000, 10, "salary")],
      loans: [loan(1500, "car")],
    });
    const loanLine = lines.find((l) => l.text.includes("car"));
    expect(loanLine?.tone).toBe("calm");
  });

  it("omits the loan line when no loan exceeds 10% of monthly income", () => {
    const lines = buildSmartSummary({
      snapshot: snap(),
      incomes: [income(10_000, 10, "salary")],
      loans: [loan(500, "small")],
    });
    expect(lines.find((l) => l.text.includes("small"))).toBeUndefined();
  });

  it("omits the daily-allowance line when nothing safe-to-spend remains", () => {
    const lines = buildSmartSummary({
      snapshot: snap({ dailySafeToSpend: 0, safeToSpendUntilMonthEnd: 0 }),
      incomes: [],
      loans: [],
    });
    expect(
      lines.some((l) => l.text.includes("נשארים") && l.text.includes("ליום")),
    ).toBe(false);
  });
});
