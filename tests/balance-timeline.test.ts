import { describe, expect, it } from "vitest";
import { forecastBalanceTimeline } from "@/lib/forecast";
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
    remainingBalance: installment * 12,
    endDate: new Date(2027, 0, 1).toISOString(),
    dayOfMonth: day,
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function ruleAt(
  label: string,
  amount: number,
  day: number,
): RecurringRule {
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

function entry(
  id: string,
  amount: number,
  dateIso: string,
  overrides: Partial<ExpenseEntry> = {},
): ExpenseEntry {
  return {
    id,
    amount,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: dateIso,
    createdAt: dateIso,
    ...overrides,
  };
}

const PRIOR_MONTH = "2026-04";
const PRIOR_NOW = new Date(2026, 4, 15, 12, 0, 0); // May 15 — outside the prior month

describe("forecastBalanceTimeline", () => {
  it("projects the full month when monthKey is in the past relative to now", () => {
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 1000)],
      loans: [],
      incomes: [income("salary", 500, 10)],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: PRIOR_MONTH,
      now: PRIOR_NOW,
    });
    expect(t.startDay).toBe(1);
    expect(t.points.length).toBe(30); // April has 30 days
    // Income lands on day 10 → balance jumps to 1500 from then on.
    expect(t.points[0].balance).toBe(1000);
    expect(t.points[9].balance).toBe(1500);
    expect(t.points[29].balance).toBe(1500);
    expect(t.endBalance).toBe(1500);
    expect(t.goesNegative).toBe(false);
    expect(t.overdraftDay).toBeUndefined();
  });

  it("starts from today for the current month", () => {
    const now = new Date(2026, 4, 15, 9, 0, 0); // May 15
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 800)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    expect(t.startDay).toBe(15);
    expect(t.points[0].day).toBe(15);
    expect(t.points[t.points.length - 1].day).toBe(31);
    expect(t.points.every((p) => p.balance === 800)).toBe(true);
  });

  it("flags overdraftDay when balance dips below zero mid-month", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 200)],
      loans: [loanAt("car", 500, 10)],
      incomes: [income("salary", 1000, 25)],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    // Anchor 200 → day 10 loan -500 → -300 (overdraft) → day 25 salary +1000 → 700
    expect(t.overdraftDay).toBe(10);
    expect(t.goesNegative).toBe(true);
    expect(t.lowestDay).toBe(10);
    expect(t.lowestBalance).toBe(-300);
    expect(t.endBalance).toBe(700);
  });

  it("respects bankPending and needsConfirmation skips", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 1000)],
      loans: [],
      incomes: [],
      entries: [
        entry("a", 200, new Date(2026, 4, 10, 12, 0, 0).toISOString()),
        entry("b", 300, new Date(2026, 4, 12, 12, 0, 0).toISOString(), {
          needsConfirmation: true,
        }),
        entry("c", 400, new Date(2026, 4, 14, 12, 0, 0).toISOString(), {
          bankPending: true,
        }),
      ],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    // Only the 200 entry counts. End balance = 800.
    expect(t.endBalance).toBe(800);
    expect(t.points.find((p) => p.day === 10)?.balance).toBe(800);
  });

  it("skips refunds and non-ILS currencies", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 1000)],
      loans: [],
      incomes: [],
      entries: [
        entry("a", 200, new Date(2026, 4, 5, 12, 0, 0).toISOString(), {
          isRefund: true,
        }),
        entry("b", 300, new Date(2026, 4, 6, 12, 0, 0).toISOString(), {
          currency: "USD",
        }),
        entry("c", 400, new Date(2026, 4, 7, 12, 0, 0).toISOString()),
      ],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    expect(t.endBalance).toBe(600); // only the 400 entry
  });

  it("counts unpaid recurring rules as outflows on their dayOfMonth", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 1000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [ruleAt("electric", 250, 14)],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    expect(t.points.find((p) => p.day === 13)?.balance).toBe(1000);
    expect(t.points.find((p) => p.day === 14)?.balance).toBe(750);
    expect(t.endBalance).toBe(750);
  });

  it("ignores paid recurring rules", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", 1000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [ruleAt("electric", 250, 14)],
      statuses: [
        {
          ruleId: "rule-electric",
          monthKey: "2026-05",
          status: "paid",
        },
      ],
      monthKey: "2026-05",
      now,
    });
    // Already paid → not subtracted again.
    expect(t.endBalance).toBe(1000);
  });

  it("handles a starting balance that's already negative", () => {
    const now = new Date(2026, 4, 1, 9, 0, 0);
    const t = forecastBalanceTimeline({
      accounts: [bankAnchor("main", -100)],
      loans: [],
      incomes: [income("salary", 500, 10)],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now,
    });
    expect(t.goesNegative).toBe(true);
    expect(t.overdraftDay).toBe(1);
    expect(t.lowestBalance).toBe(-100);
    expect(t.endBalance).toBe(400); // -100 + 500 income on day 10
  });
});
