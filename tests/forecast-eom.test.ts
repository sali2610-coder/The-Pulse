import { describe, expect, it } from "vitest";
import { forecastEndOfMonth } from "@/lib/forecast";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function bankAnchor(label: string, balance: number): Account {
  return {
    id: `bank-${label}`,
    kind: "bank",
    label,
    anchorBalance: balance,
    anchorUpdatedAt: new Date().toISOString(),
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function income(label: string, amount: number, day: number): Income {
  return {
    id: `inc-${label}`,
    label,
    amount,
    dayOfMonth: day,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function loan(label: string, installment: number, day: number): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: installment,
    remainingBalance: installment * 12,
    endDate: new Date(2027, 0, 1).toISOString(),
    dayOfMonth: day,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function rule(label: string, amount: number, day: number): RecurringRule {
  return {
    id: `rule-${label}`,
    label,
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    keywords: [],
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function entry(amount: number, chargeDay: number, installments = 1): ExpenseEntry {
  return {
    id: `e-${chargeDay}-${amount}`,
    amount,
    category: "shopping",
    source: "auto",
    paymentMethod: "credit",
    installments,
    chargeDate: new Date(2026, 4, chargeDay).toISOString(),
    createdAt: new Date(2026, 4, chargeDay).toISOString(),
  };
}

const NOW = new Date(2026, 4, 10); // 2026-05-10
const MONTH = "2026-05";

describe("forecastEndOfMonth", () => {
  it("sums anchors across multiple active banks", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", -1000), bankAnchor("B", 500)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.totalAnchors).toBe(-500);
    expect(r.forecast).toBe(-500);
  });

  it("counts only future income (dayOfMonth >= today)", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 0)],
      loans: [],
      incomes: [
        income("salary", 10000, 25), // future
        income("freelance", 2000, 5), // already arrived
      ],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.expectedIncome).toBe(10000);
  });

  it("subtracts unpaid fixed expenses", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 5000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [rule("חשמל", 350, 28), rule("ועד בית", 200, 1)],
      statuses: [
        // ועד בית already paid
        {
          ruleId: "rule-ועד בית",
          monthKey: MONTH,
          status: "paid",
          actualAmount: 200,
        },
      ],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.pendingFixed).toBe(350); // only חשמל left
    expect(r.forecast).toBe(5000 - 350);
  });

  it("subtracts pending loan installments due this month", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 5000)],
      loans: [
        loan("רכב", 1500, 18), // future this month
        loan("משכנתא", 4000, 1), // already debited
      ],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.pendingLoans).toBe(1500);
  });

  it("subtracts only future card slices", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 5000)],
      loans: [],
      incomes: [],
      entries: [
        entry(200, 5), // already charged → already in anchor
        entry(300, 25), // future this month
      ],
      rules: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.futureCardSlices).toBe(300);
  });

  it("composes the full formula", () => {
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 2000), bankAnchor("B", -500)],
      loans: [loan("רכב", 1000, 18)],
      incomes: [income("salary", 12000, 25)],
      entries: [
        entry(400, 5), // past → ignored
        entry(600, 28), // future this month
      ],
      rules: [rule("חשמל", 350, 20)],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    // anchors = 1500, income = 12000, fixed = 350, loans = 1000, future = 600
    expect(r.forecast).toBe(1500 + 12000 - 350 - 1000 - 600);
  });

  it("ignores refunds and FX charges in futureCardSlices", () => {
    const fx: ExpenseEntry = {
      ...entry(500, 28),
      currency: "USD",
    };
    const refund: ExpenseEntry = {
      ...entry(200, 28),
      isRefund: true,
    };
    const r = forecastEndOfMonth({
      accounts: [bankAnchor("A", 5000)],
      loans: [],
      incomes: [],
      entries: [fx, refund, entry(300, 28)],
      rules: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(r.futureCardSlices).toBe(300);
  });
});
