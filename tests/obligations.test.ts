import { describe, expect, it } from "vitest";

import {
  monthObligations,
  obligationsTimeline,
  safeToSpend,
  summarizeMonth,
} from "@/lib/obligations";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: o.label ?? "חשמל",
    category: "other",
    estimatedAmount: 300,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? "l1",
    label: o.label ?? "מכונית",
    monthlyInstallment: 1500,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: o.label ?? "שכר",
    amount: 18000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? "e1",
    amount: 250,
    category: "food",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10).toISOString(),
    createdAt: new Date(2026, 4, 10).toISOString(),
    ...o,
  };
}

function bank(balance: number): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: balance,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("monthObligations", () => {
  it("groups rules + loans + incomes + entries on the right days", () => {
    const items = monthObligations({
      rules: [rule({ dayOfMonth: 10, estimatedAmount: 300 })],
      loans: [loan({ dayOfMonth: 1, monthlyInstallment: 1500 })],
      incomes: [income({ dayOfMonth: 1, amount: 18000 })],
      entries: [entry({ chargeDate: new Date(2026, 4, 15).toISOString() })],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(items).toHaveLength(4);
    // Sorted by date ascending — loan + income on day 1, rule on 10, entry on 15.
    expect(items.map((i) => i.kind)).toEqual([
      ...new Set(items.filter((i) => i.dayOfMonth === 1).map((i) => i.kind)),
      "recurring",
      "entry-slice",
    ].slice(0, 4));
    // Income is signed negative.
    expect(items.find((i) => i.kind === "income")!.amount).toBe(-18000);
  });

  it("respects paid statuses by not flagging them as pending", () => {
    const items = monthObligations({
      rules: [rule({ id: "r1", dayOfMonth: 10 })],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [{ ruleId: "r1", monthKey: "2026-05", status: "paid" }],
      monthKey: "2026-05",
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("paid");
  });

  it("skips inactive rules + loans + incomes", () => {
    const items = monthObligations({
      rules: [rule({ active: false })],
      loans: [loan({ active: false })],
      incomes: [income({ active: false })],
      entries: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(items).toEqual([]);
  });

  it("does not double-count entries already matched to a rule", () => {
    const items = monthObligations({
      rules: [rule({ id: "r1", dayOfMonth: 10 })],
      loans: [],
      incomes: [],
      entries: [entry({ id: "e1" })],
      statuses: [
        {
          ruleId: "r1",
          monthKey: "2026-05",
          status: "paid",
          matchedExpenseId: "e1",
        },
      ],
      monthKey: "2026-05",
    });
    // Rule shows as paid; the matched entry is suppressed.
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("recurring");
  });
});

describe("summarizeMonth", () => {
  it("computes net = income - outflow", () => {
    const items = monthObligations({
      rules: [rule({ estimatedAmount: 500 })],
      loans: [loan({ monthlyInstallment: 1500 })],
      incomes: [income({ amount: 10000 })],
      entries: [],
      statuses: [],
      monthKey: "2026-05",
    });
    const s = summarizeMonth(items, "2026-05");
    expect(s.income).toBe(10000);
    expect(s.fixed).toBe(500);
    expect(s.loans).toBe(1500);
    expect(s.outflow).toBe(2000);
    expect(s.net).toBe(8000);
  });
});

describe("obligationsTimeline", () => {
  it("projects N months forward", () => {
    const tl = obligationsTimeline({
      rules: [rule({ estimatedAmount: 300 })],
      loans: [],
      incomes: [income({ amount: 18000 })],
      entries: [],
      statuses: [],
      startMonth: "2026-05",
      months: 3,
    });
    expect(tl.map((t) => t.monthKey)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(tl[0].net).toBe(18000 - 300);
    expect(tl[2].net).toBe(18000 - 300);
  });

  it("handles installment plans expiring during the window", () => {
    // 3-month plan starting May 2026.
    const r = rule({
      installmentTotal: 3,
      startMonth: 5,
      startYear: 2026,
      estimatedAmount: 100,
    });
    const tl = obligationsTimeline({
      rules: [r],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      startMonth: "2026-05",
      months: 5,
    });
    expect(tl[0].fixed).toBe(100); // May
    expect(tl[1].fixed).toBe(100); // June
    expect(tl[2].fixed).toBe(100); // July
    expect(tl[3].fixed).toBe(0); // August — plan complete
    expect(tl[4].fixed).toBe(0);
  });
});

describe("safeToSpend", () => {
  it("happy path: anchors + income - obligations / days", () => {
    const r = safeToSpend({
      accounts: [bank(10000)],
      loans: [],
      incomes: [],
      rules: [],
      entries: [],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: new Date(2026, 4, 1, 8, 0, 0), // May 1
    });
    expect(r.daysRemaining).toBe(31);
    expect(r.totalRemaining).toBe(10000);
    expect(Math.round(r.perDay)).toBe(Math.round(10000 / 31));
    expect(r.overBudget).toBe(false);
  });

  it("over-budget when commitments exceed anchors+income", () => {
    const r = safeToSpend({
      accounts: [bank(1000)],
      loans: [loan({ monthlyInstallment: 5000, dayOfMonth: 15 })],
      incomes: [],
      rules: [],
      entries: [],
      statuses: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: new Date(2026, 4, 1, 8, 0, 0),
    });
    expect(r.totalRemaining).toBe(-4000);
    expect(r.overBudget).toBe(true);
  });

  it("respects monthlyBudget cap when set", () => {
    const r = safeToSpend({
      accounts: [bank(50000)],
      loans: [],
      incomes: [],
      rules: [],
      entries: [],
      statuses: [],
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 1, 8, 0, 0),
    });
    expect(r.totalRemaining).toBe(5000);
  });
});
