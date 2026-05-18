import { describe, expect, it } from "vitest";

import { buildDailyCashflow } from "@/lib/daily-cashflow";
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
    id: `inc-${day}`,
    label,
    amount,
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

function loan(amount: number, day: number): Loan {
  return {
    id: `loan-${day}`,
    label: "car",
    monthlyInstallment: amount,
    remainingBalance: 100_000,
    endDate: "2030-01-01",
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function entry(amount: number, day: number, installments = 1): ExpenseEntry {
  const chargeDate = new Date(2026, 4, day).toISOString();
  return {
    id: `e-${day}-${installments}-${amount}`,
    amount,
    installments,
    chargeDate,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    note: "Shufersal",
    merchant: "Shufersal",
    createdAt: chargeDate,
  };
}

const NO_STATUSES: RecurringStatus[] = [];

describe("buildDailyCashflow", () => {
  it("returns a series with one entry per day of the month", () => {
    const cf = buildDailyCashflow({
      accounts: [bank(1000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now: new Date("2026-05-10T08:00:00.000Z"),
    });
    expect(cf.days).toHaveLength(31);
    expect(cf.startBalance).toBe(1000);
    expect(cf.endBalance).toBe(1000); // no movements
  });

  it("adds salary inflow on its dayOfMonth", () => {
    const cf = buildDailyCashflow({
      accounts: [bank(0)],
      loans: [],
      incomes: [income(10_000, 1)],
      entries: [],
      rules: [],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now: new Date("2026-05-01T08:00:00.000Z"),
    });
    expect(cf.days[0].inflows).toBe(10_000);
    expect(cf.days[0].runningBalance).toBe(10_000);
    expect(cf.endBalance).toBe(10_000);
  });

  it("subtracts loan + rule + card slice on their respective days", () => {
    const cf = buildDailyCashflow({
      accounts: [bank(20_000)],
      loans: [loan(1500, 5)],
      incomes: [],
      entries: [entry(800, 10)],
      rules: [rule(400, 15)],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now: new Date("2026-05-02T08:00:00.000Z"),
    });
    expect(cf.days[4].outflows).toBe(1500); // day 5 = loan
    expect(cf.days[9].outflows).toBe(800); // day 10 = entry
    expect(cf.days[14].outflows).toBe(400); // day 15 = rule
    expect(cf.endBalance).toBe(20_000 - 1500 - 800 - 400);
  });

  it("skips paid recurring rules", () => {
    const r = rule(500, 7);
    const cf = buildDailyCashflow({
      accounts: [bank(10_000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [r],
      statuses: [
        {
          ruleId: r.id,
          monthKey: MONTH,
          status: "paid",
          matchedExpenseId: "e1",
          actualAmount: 500,
        },
      ],
      monthKey: MONTH,
      now: new Date("2026-05-02T08:00:00.000Z"),
    });
    expect(cf.days[6].outflows).toBe(0);
    expect(cf.endBalance).toBe(10_000);
  });

  it("excludes needsConfirmation, bankPending, and refund entries", () => {
    const e1 = entry(300, 10);
    const e2: ExpenseEntry = { ...entry(400, 11), needsConfirmation: true };
    const e3: ExpenseEntry = { ...entry(500, 12), bankPending: true };
    const e4: ExpenseEntry = { ...entry(600, 13), isRefund: true };
    const cf = buildDailyCashflow({
      accounts: [bank(5000)],
      loans: [],
      incomes: [],
      entries: [e1, e2, e3, e4],
      rules: [],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now: new Date("2026-05-09T08:00:00.000Z"),
    });
    expect(cf.endBalance).toBe(5000 - 300);
  });

  it("flags today + past correctly when monthKey === currentMonth", () => {
    const now = new Date("2026-05-15T12:00:00.000Z");
    const cf = buildDailyCashflow({
      accounts: [bank(0)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now,
    });
    expect(cf.days[14].isToday).toBe(true);
    expect(cf.days[14].isPast).toBe(false);
    expect(cf.days[10].isPast).toBe(true);
    expect(cf.days[20].isPast).toBe(false);
  });

  it("orders events by absolute amount within a day", () => {
    const cf = buildDailyCashflow({
      accounts: [bank(0)],
      loans: [loan(2000, 5)],
      incomes: [],
      entries: [entry(50, 5), entry(800, 5)],
      rules: [rule(100, 5)],
      statuses: NO_STATUSES,
      monthKey: MONTH,
      now: new Date("2026-05-02T08:00:00.000Z"),
    });
    const day5 = cf.days[4];
    expect(day5.events.map((e) => Math.abs(e.amount))).toEqual([
      2000, 800, 100, 50,
    ]);
  });
});
