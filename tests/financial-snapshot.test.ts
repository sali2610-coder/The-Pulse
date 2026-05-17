import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 4, 1, 9, 0, 0); // May 1

function bank(label: string, balance: number): Account {
  return {
    id: `bank-${label}`,
    kind: "bank",
    label,
    anchorBalance: balance,
    anchorUpdatedAt: new Date(2026, 4, 1).toISOString(),
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function income(label: string, amount: number, day: number): Income {
  return {
    id: `inc-${label}`,
    label,
    amount,
    dayOfMonth: day,
    active: true,
    createdAt: NOW.toISOString(),
  };
}

function loan(label: string, installment: number, day: number): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: installment,
    dayOfMonth: day,
    active: true,
    createdAt: NOW.toISOString(),
  };
}

function rule(
  label: string,
  amount: number,
  day: number,
  overrides: Partial<RecurringRule> = {},
): RecurringRule {
  return {
    id: `rule-${label}`,
    label,
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    keywords: [],
    active: true,
    createdAt: NOW.toISOString(),
    ...overrides,
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
    chargeDate: new Date(2026, 4, 3).toISOString(),
    createdAt: new Date(2026, 4, 3).toISOString(),
    ...overrides,
  };
}

describe("buildFinancialSnapshot", () => {
  it("produces the canonical projection on day 1 of the month", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 5000)],
      loans: [loan("car", 1000, 10)],
      incomes: [income("salary", 8000, 15)],
      entries: [],
      rules: [rule("electric", 250, 14)],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(s.currentBalance).toBe(5000);
    expect(s.expectedIncomeUntilNextMonth).toBe(8000);
    expect(s.fixedExpensesUntilNextMonth).toBe(250);
    expect(s.activeLoansPaymentsUntilNextMonth).toBe(1000);
    expect(s.projectedBalanceWithoutDiscretionary).toBe(11750);
    expect(s.projectedBalanceOnFirstOfNextMonth).toBe(11750);
    expect(s.expectedOverdraft).toBe(0);
    expect(s.safeToSpendUntilMonthEnd).toBe(11750);
    expect(s.riskLevel).toBe("safe");
  });

  it("flags expected overdraft when budget exceeds remaining cash", () => {
    // After loans/rules a user expects 5,000 left.
    // monthlyBudget = 13,000 → expected overdraft 8,000.
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 1000)],
      loans: [],
      incomes: [income("salary", 9000, 15)],
      entries: [],
      rules: [rule("rent", 5000, 1)],
      statuses: [],
      monthlyBudget: 13000,
      monthKey: "2026-05",
      now: NOW,
    });
    // 1000 + 9000 − 5000 = 5000 free for discretionary.
    expect(s.projectedBalanceWithoutDiscretionary).toBe(5000);
    // budget = 13000 → discretionary spend = 13000.
    expect(s.remainingPlannedSpending).toBe(13000);
    expect(s.projectedBalanceOnFirstOfNextMonth).toBe(-8000);
    expect(s.expectedOverdraft).toBe(8000);
    expect(s.riskLevel).toBe("overdraft");
  });

  it("classifies tight when current is positive but projected near zero", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 10000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [rule("rent", 9700, 14)],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(s.projectedBalanceOnFirstOfNextMonth).toBe(300);
    expect(s.riskLevel).toBe("tight");
  });

  it("subtracts already-charged entries from spending budget", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 5000)],
      loans: [],
      incomes: [],
      entries: [
        entry({
          amount: 300,
          chargeDate: new Date(2026, 4, 5).toISOString(),
        }),
      ],
      rules: [],
      statuses: [],
      monthlyBudget: 2000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 20, 12, 0, 0),
    });
    expect(s.actualSpentThisMonth).toBe(300);
    expect(s.remainingBudgetThisMonth).toBe(1700);
    expect(s.remainingPlannedSpending).toBe(1700);
  });

  it("treats future entry slices as recurring commitments", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 5000)],
      loans: [],
      incomes: [],
      entries: [
        entry({
          amount: 400,
          chargeDate: new Date(2026, 4, 25).toISOString(),
        }),
      ],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: new Date(2026, 4, 10),
    });
    expect(s.recurringCommitmentsUntilNextMonth).toBe(400);
    expect(s.projectedBalanceWithoutDiscretionary).toBe(4600);
  });

  it("falls back to safe risk when no budget and projection is comfortable", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 8000)],
      loans: [],
      incomes: [income("salary", 5000, 25)],
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(s.riskLevel).toBe("safe");
  });

  it("daily safe-to-spend respects days remaining", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", 3000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: new Date(2026, 4, 16, 12, 0, 0),
    });
    // 31 - 16 + 1 = 16 days remaining; floor(3000/16) = 187.
    expect(s.dailySafeToSpend).toBe(187);
  });

  it("clamps safe-to-spend to 0 when current balance is already negative", () => {
    const s = buildFinancialSnapshot({
      accounts: [bank("main", -500)],
      loans: [],
      incomes: [income("salary", 1000, 25)],
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 200,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(s.safeToSpendUntilMonthEnd).toBe(0);
    expect(s.riskLevel).toBe("tight");
  });
});
