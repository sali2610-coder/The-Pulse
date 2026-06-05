// Phase 381 — canonical daily-budget view invariants.

import { describe, expect, it } from "vitest";

import { buildDailyBudgetView } from "@/lib/daily-budget-view";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i-1",
    label: "Salary",
    amount: 13_000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

const NOW = new Date(2026, 5, 5, 12, 0, 0); // June 5

describe("buildDailyBudgetView", () => {
  it("anchors on the 10th of next month", () => {
    const view = buildDailyBudgetView({
      accounts: [bank()],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    const anchor = new Date(view.anchorISO);
    expect(anchor.getDate()).toBe(10);
    expect(anchor.getMonth()).toBe(6); // July (zero-indexed)
    expect(view.anchorOffset).toBeGreaterThan(0);
  });

  it("realAvailable can be negative — does NOT clamp to 0", () => {
    // Big bank-fixed rule firing on day 25 drains the anchor.
    const view = buildDailyBudgetView({
      accounts: [bank({ anchorBalance: 1_000 })],
      loans: [],
      incomes: [],
      entries: [],
      rules: [
        rule({
          id: "r-arnona",
          estimatedAmount: 9_000,
          dayOfMonth: 25,
          paymentSource: "bank",
        }),
      ],
      statuses: [],
      now: NOW,
    });
    expect(view.realAvailable).toBeLessThan(0);
    expect(view.deficit).toBeGreaterThan(0);
    expect(view.state).toBe("deficit");
    expect(view.perDay).toBe(0);
  });

  it("positive forecast → state calm + per-day > 0", () => {
    const view = buildDailyBudgetView({
      accounts: [bank({ anchorBalance: 30_000 })],
      loans: [],
      incomes: [income()],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(view.realAvailable).toBeGreaterThan(0);
    expect(view.deficit).toBe(0);
    expect(view.perDay).toBeGreaterThan(0);
    expect(view.state).not.toBe("deficit");
  });

  it("expectedIncome counts income events strictly after now", () => {
    const view = buildDailyBudgetView({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 1, amount: 13_000 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    // July 1 income lands inside the window; June 1 is in the past.
    expect(view.expectedIncome).toBeGreaterThanOrEqual(13_000);
  });

  it("totalCommitments matches getMonthlyObligationBreakdown total", () => {
    const view = buildDailyBudgetView({
      accounts: [bank()],
      loans: [
        {
          id: "l-1",
          label: "loan",
          monthlyInstallment: 4_970,
          dayOfMonth: 12,
          startMonth: 6,
          startYear: 2026,
          totalPayments: 60,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        } satisfies Loan,
      ],
      incomes: [],
      entries: [] as ExpenseEntry[],
      rules: [
        rule({
          id: "r-bank",
          estimatedAmount: 800,
          dayOfMonth: 8,
          paymentSource: "bank",
        }),
      ],
      statuses: [],
      now: NOW,
    });
    expect(view.totalCommitments).toBe(4_970 + 800);
    expect(view.monthlyFreeBalance).toBe(view.expectedIncome - view.totalCommitments);
  });
});
