import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function bank(id: string, anchor: number): Account {
  return {
    id,
    kind: "bank",
    label: id,
    active: true,
    anchorBalance: anchor,
    anchorUpdatedAt: NOW.toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function card(opts: Partial<Account> & { id: string }): Account {
  return {
    kind: "card",
    label: opts.label ?? opts.id,
    active: true,
    cardLast4: "1234",
    paymentDay: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function loan(opts: Partial<Loan> & { id: string }): Loan {
  return {
    label: "loan",
    monthlyInstallment: 500,
    dayOfMonth: 5,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function income(opts: Partial<Income> & { id: string }): Income {
  return {
    label: "salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function rule(opts: Partial<RecurringRule> & { id: string }): RecurringRule {
  return {
    label: "rule",
    category: "bills",
    estimatedAmount: 200,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function _entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: `e-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    createdAt: iso,
    ...rest,
  };
}
void _entry;

describe("liquidityCurve", () => {
  it("emits windowDays+1 points (today + every day forward)", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 5000)],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 7,
    });
    expect(c.points).toHaveLength(8);
    expect(c.points[0].balance).toBe(5000);
  });

  it("starts at the sum of active bank anchors", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 7000), bank("b", -1000)],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
    });
    expect(c.startingBalance).toBe(6000);
  });

  it("salary inflow inside window raises the curve on its day", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 1000)],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    const before = c.points.find((p) => p.whenISO.startsWith("2026-05-24"))?.balance;
    const onPay = c.points.find((p) => p.whenISO.startsWith("2026-05-25"))?.balance;
    expect(before).toBe(1000);
    expect(onPay).toBe(14000);
  });

  it("loan obligation subtracts on dayOfMonth", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 10000)],
      loans: [loan({ id: "l", monthlyInstallment: 2000, dayOfMonth: 20 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    const onPay = c.points.find((p) => p.whenISO.startsWith("2026-05-20"))?.balance;
    expect(onPay).toBe(8000);
  });

  it("card-linked recurring rule lands on card paymentDay, not rule day", () => {
    const cal = card({ id: "cal", paymentDay: 24 });
    const ruleOnCard = rule({
      id: "r-card",
      label: "Insurance",
      dayOfMonth: 1,
      paymentSource: "card",
      linkedCardId: "cal",
      estimatedAmount: 800,
    });
    const c = liquidityCurve({
      accounts: [bank("a", 10000), cal],
      loans: [],
      incomes: [],
      rules: [ruleOnCard],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    // Rule day (1st) → balance still 10000.
    const onFirst = c.points.find((p) => p.whenISO.startsWith("2026-05-16"))?.balance;
    expect(onFirst).toBe(10000);
    // Card paymentDay (24th) → drops.
    const onSettle = c.points.find((p) => p.whenISO.startsWith("2026-05-24"))?.balance;
    expect(onSettle).toBe(9200);
  });

  it("finds lowest + highest + crossesNegative when balance dips below zero", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 500)],
      loans: [loan({ id: "big", monthlyInstallment: 3000, dayOfMonth: 20 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    expect(c.crossesNegative).toBe(true);
    expect(c.lowestPoint.balance).toBeLessThan(0);
    expect(c.highestPoint.balance).toBe(500);
  });

  it("balanceAtNextSalary reflects the dip + recovery shape", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 1000)],
      loans: [loan({ id: "l", monthlyInstallment: 500, dayOfMonth: 20 })],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    expect(c.balanceAtNextSalary).toBe(13500);
    expect(c.nextSalaryAt).toContain("2026-05-25");
  });

  it("totalInflow + totalOutflow account every event", () => {
    const c = liquidityCurve({
      accounts: [bank("a", 5000)],
      loans: [loan({ id: "l", monthlyInstallment: 500, dayOfMonth: 20 })],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
      windowDays: 20,
    });
    expect(c.totalOutflow).toBe(500);
    expect(c.totalInflow).toBe(13000);
  });
});
