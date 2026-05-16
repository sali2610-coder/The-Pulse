import { describe, expect, it } from "vitest";
import { forecastBalanceChain } from "@/lib/forecast";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

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
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function loanAt(label: string, installment: number, day: number): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: installment,
    remainingBalance: installment * 24,
    endDate: new Date(2028, 4, 1).toISOString(),
    dayOfMonth: day,
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function ruleAt(label: string, amount: number, day: number): RecurringRule {
  return {
    id: `rule-${label}`,
    label,
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    keywords: [],
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

const NOW = new Date(2026, 4, 1, 9, 0, 0); // May 1

describe("forecastBalanceChain", () => {
  it("carries the projected ending balance into the next month's start", () => {
    const chain = forecastBalanceChain({
      accounts: [bank("main", 1000)],
      loans: [],
      incomes: [income("salary", 500, 10)],
      entries: [],
      rules: [],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 3,
      now: NOW,
    });
    expect(chain.length).toBe(3);
    expect(chain[0].startBalance).toBe(1000);
    expect(chain[0].endBalance).toBe(1500); // +500 salary
    expect(chain[1].startBalance).toBe(1500); // carryover
    expect(chain[1].endBalance).toBe(2000);
    expect(chain[2].startBalance).toBe(2000);
    expect(chain[2].endBalance).toBe(2500);
  });

  it("flags the first month that crosses zero", () => {
    const chain = forecastBalanceChain({
      accounts: [bank("main", 800)],
      loans: [loanAt("car", 500, 10)],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 3,
      now: NOW,
    });
    // -500/month: 800 → 300 → -200 → -700.
    expect(chain[0].goesNegative).toBe(false);
    expect(chain[1].goesNegative).toBe(true);
    expect(chain[2].goesNegative).toBe(true);
    expect(chain[1].overdraftDay).toBe(10);
  });

  it("respects rules + loans in each month", () => {
    const chain = forecastBalanceChain({
      accounts: [bank("main", 2000)],
      loans: [loanAt("car", 200, 5)],
      incomes: [income("salary", 1000, 1)],
      entries: [],
      rules: [ruleAt("electric", 100, 14)],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 2,
      now: NOW,
    });
    // Per month delta: +1000 salary - 200 loan - 100 rule = +700.
    expect(chain[0].endBalance).toBe(2700);
    expect(chain[1].startBalance).toBe(2700);
    expect(chain[1].endBalance).toBe(3400);
  });

  it("treats per-month entry slices the same as the single-month forecaster", () => {
    const e: ExpenseEntry = {
      id: "x",
      amount: 600,
      category: "shopping",
      source: "manual",
      paymentMethod: "credit",
      installments: 3,
      chargeDate: new Date(2026, 4, 15, 12, 0, 0).toISOString(),
      createdAt: new Date(2026, 4, 15, 12, 0, 0).toISOString(),
    };
    const chain = forecastBalanceChain({
      accounts: [bank("main", 1000)],
      loans: [],
      incomes: [],
      entries: [e],
      rules: [],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 4,
      now: NOW,
    });
    // 200/month for 3 months, then nothing.
    expect(chain[0].endBalance).toBe(800);
    expect(chain[1].endBalance).toBe(600);
    expect(chain[2].endBalance).toBe(400);
    expect(chain[3].endBalance).toBe(400);
  });

  it("clamps the months parameter to [1, 12]", () => {
    const tooFew = forecastBalanceChain({
      accounts: [bank("main", 100)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 0,
      now: NOW,
    });
    expect(tooFew.length).toBe(1);
    const tooMany = forecastBalanceChain({
      accounts: [bank("main", 100)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      fromMonthKey: "2026-05",
      months: 99,
      now: NOW,
    });
    expect(tooMany.length).toBe(12);
  });
});
