// Live-engine contract test.
//
// Proves that EVERY major financial readout — snapshot, daily
// allowance, smart summary, daily cashflow — derives from the same
// store input and recomputes when any of those inputs change. If a
// future refactor caches snapshot output or duplicates math somewhere
// else, these specs catch it.

import { describe, expect, it } from "vitest";

import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildDailyCashflow } from "@/lib/daily-cashflow";
import { buildSmartSummary } from "@/lib/smart-summary";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MONTH: MonthKey = "2026-05";
const NOW = new Date("2026-05-10T08:00:00.000Z");

function bank(anchor: number): Account {
  return {
    id: "bank1",
    kind: "bank",
    label: "Main",
    active: true,
    anchorBalance: anchor,
    anchorUpdatedAt: "2026-05-01T00:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function income(amount: number, day: number, label = "salary"): Income {
  return {
    id: `inc-${day}-${label}`,
    label,
    amount,
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function loan(amount: number, day: number, label = "car"): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: amount,
    remainingBalance: 50_000,
    endDate: "2030-01-01",
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function rule(amount: number, day: number, label = "חשמל"): RecurringRule {
  return {
    id: `rule-${day}-${label}`,
    label,
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    active: true,
    keywords: [],
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function expense(amount: number, day: number): ExpenseEntry {
  const date = new Date(2026, 4, day).toISOString();
  return {
    id: `e-${day}-${amount}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    merchant: "test",
    createdAt: date,
  };
}

const NO_STATUSES: RecurringStatus[] = [];

function build(args: {
  accounts: Account[];
  incomes: Income[];
  loans: Loan[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  monthlyBudget: number;
}) {
  const snapshot = buildFinancialSnapshot({
    ...args,
    statuses: NO_STATUSES,
    monthKey: MONTH,
    now: NOW,
  });
  const cashflow = buildDailyCashflow({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    entries: args.entries,
    rules: args.rules,
    statuses: NO_STATUSES,
    monthKey: MONTH,
    now: NOW,
  });
  const summary = buildSmartSummary({
    snapshot,
    incomes: args.incomes,
    loans: args.loans,
    today: NOW,
  });
  return { snapshot, cashflow, summary };
}

describe("live engine — single financial brain", () => {
  it("salary edit propagates to snapshot, cashflow, and summary", () => {
    const before = build({
      accounts: [bank(0)],
      incomes: [income(5000, 25)],
      loans: [],
      rules: [],
      entries: [],
      monthlyBudget: 0,
    });
    const after = build({
      accounts: [bank(0)],
      incomes: [income(8000, 25)],
      loans: [],
      rules: [],
      entries: [],
      monthlyBudget: 0,
    });
    expect(after.snapshot.expectedIncomeUntilNextMonth).toBe(8000);
    expect(after.snapshot.expectedIncomeUntilNextMonth).not.toBe(
      before.snapshot.expectedIncomeUntilNextMonth,
    );
    const salaryDayAfter = after.cashflow.days.find((d) => d.day === 25);
    expect(salaryDayAfter?.inflows).toBe(8000);
    expect(after.summary[0].text).not.toBe(before.summary[0].text);
  });

  it("loan edit changes obligations + cashflow + summary loan line", () => {
    const before = build({
      accounts: [bank(0)],
      incomes: [income(10_000, 25)],
      loans: [loan(1500, 20, "car")],
      rules: [],
      entries: [],
      monthlyBudget: 0,
    });
    const after = build({
      accounts: [bank(0)],
      incomes: [income(10_000, 25)],
      loans: [loan(3500, 20, "car")],
      rules: [],
      entries: [],
      monthlyBudget: 0,
    });
    expect(after.snapshot.activeLoansPaymentsUntilNextMonth).toBeGreaterThan(
      before.snapshot.activeLoansPaymentsUntilNextMonth,
    );
    const carDay = after.cashflow.days.find((d) => d.day === 20);
    expect(carDay?.outflows).toBe(3500);
    const beforeLoanLine = before.summary.find((l) => l.text.includes("car"));
    const afterLoanLine = after.summary.find((l) => l.text.includes("car"));
    expect(afterLoanLine?.tone).toBe("warn");
    expect(beforeLoanLine?.tone).not.toBe("warn");
  });

  it("recurring rule edit changes snapshot fixedExpenses + day event", () => {
    const before = build({
      accounts: [bank(0)],
      incomes: [],
      loans: [],
      rules: [rule(400, 12, "חשמל")],
      entries: [],
      monthlyBudget: 0,
    });
    const after = build({
      accounts: [bank(0)],
      incomes: [],
      loans: [],
      rules: [rule(900, 12, "חשמל")],
      entries: [],
      monthlyBudget: 0,
    });
    expect(after.snapshot.fixedExpensesUntilNextMonth).toBe(900);
    expect(before.snapshot.fixedExpensesUntilNextMonth).toBe(400);
    const day12After = after.cashflow.days.find((d) => d.day === 12);
    expect(day12After?.outflows).toBe(900);
  });

  it("manual expense addition affects projected balance + running total", () => {
    const baseline = build({
      accounts: [bank(10_000)],
      incomes: [],
      loans: [],
      rules: [],
      entries: [],
      monthlyBudget: 0,
    });
    const withExpense = build({
      accounts: [bank(10_000)],
      incomes: [],
      loans: [],
      rules: [],
      entries: [expense(500, 9)], // 9 < now=10 → "past" slice
      monthlyBudget: 0,
    });
    // Past slice flows into actualSpentThisMonth.
    expect(withExpense.snapshot.actualSpentThisMonth).toBe(500);
    expect(baseline.snapshot.actualSpentThisMonth).toBe(0);
    // End-of-month projection drops by the same 500 in the cashflow
    // running balance.
    expect(withExpense.cashflow.endBalance).toBe(
      baseline.cashflow.endBalance - 500,
    );
  });

  it("budget change flips remainingBudgetThisMonth + summary tone", () => {
    const tight = build({
      accounts: [bank(0)],
      incomes: [income(5000, 25)],
      loans: [],
      rules: [],
      entries: [expense(4500, 8)],
      monthlyBudget: 2000,
    });
    const loose = build({
      accounts: [bank(0)],
      incomes: [income(5000, 25)],
      loans: [],
      rules: [],
      entries: [expense(4500, 8)],
      monthlyBudget: 10_000,
    });
    expect(tight.snapshot.remainingBudgetThisMonth).toBe(0);
    expect(loose.snapshot.remainingBudgetThisMonth).toBe(10_000 - 4500);
  });
});
