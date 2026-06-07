// Phase 419 — Activity-feed contract pinned.
//
// Acceptance per user spec:
//   • Activity feed row appears for every manual user-driven entry
//     dated this month: regular expenses, bank withdrawals, cash
//     withdrawals, wallet entries, imported one-time entries.
//   • Withdrawals carry direction="out" so the consumer's
//     "monthSpend" KPI and "latest expense" pick them up.
//   • Recurring rules and loans never enter the feed (engine emits
//     entries only).
//   • Installment slices from past purchases must not appear in
//     subsequent months. Only the original purchase month emits a row.

import { describe, expect, it } from "vitest";

import { getActivityFeed, buildEngineCtx } from "@/lib/financial-engine";
import type {
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;

function ctx(args: {
  entries?: ExpenseEntry[];
  rules?: RecurringRule[];
  loans?: Loan[];
  incomes?: Income[];
}) {
  return buildEngineCtx({
    accounts: [],
    rules: args.rules ?? [],
    statuses: [],
    entries: args.entries ?? [],
    loans: args.loans ?? [],
    incomes: args.incomes ?? [],
    monthlyBudget: 0,
    monthKey: MONTH_KEY,
    now: new Date(2026, 5, 15, 10, 0, 0),
  });
}

function expenseEntry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  const iso = new Date(2026, 5, 10, 12, 0, 0).toISOString();
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: iso,
    createdAt: iso,
    occurredAt: iso,
    ...o,
  };
}

function bankWithdrawal(amount: number, day = 10): ExpenseEntry {
  const iso = new Date(2026, 5, day, 14, 30, 0).toISOString();
  return expenseEntry({
    amount,
    paymentMethod: "cash",
    transactionType: "withdrawal",
    withdrawalKind: "transfer",
    withdrawalDestination: "חיסכון",
    category: "other",
    chargeDate: iso,
    createdAt: iso,
    occurredAt: iso,
  });
}

function cashWithdrawal(amount: number, day = 8): ExpenseEntry {
  const iso = new Date(2026, 5, day, 9, 15, 0).toISOString();
  return expenseEntry({
    amount,
    paymentMethod: "cash",
    transactionType: "withdrawal",
    withdrawalKind: "atm",
    category: "other",
    chargeDate: iso,
    createdAt: iso,
    occurredAt: iso,
  });
}

describe("getActivityFeed — outgoing activity pins withdrawals", () => {
  it("manual bank withdrawal of ₪1 appears as out row with full amount", () => {
    const feed = getActivityFeed(ctx({ entries: [bankWithdrawal(1, 12)] }));
    expect(feed.rows).toHaveLength(1);
    const row = feed.rows[0];
    expect(row.direction).toBe("out");
    expect(row.amount).toBe(1);
    expect(row.isWithdrawal).toBe(true);
  });

  it("manual cash withdrawal of ₪1 appears as out row with full amount", () => {
    const feed = getActivityFeed(ctx({ entries: [cashWithdrawal(1, 7)] }));
    expect(feed.rows).toHaveLength(1);
    const row = feed.rows[0];
    expect(row.direction).toBe("out");
    expect(row.amount).toBe(1);
    expect(row.isWithdrawal).toBe(true);
  });

  it("monthSpend (Σ out rows) includes withdrawals — KPI matches list", () => {
    const feed = getActivityFeed(
      ctx({
        entries: [
          expenseEntry({ id: "e1", amount: 50 }),
          bankWithdrawal(1, 11),
          cashWithdrawal(20, 9),
        ],
      }),
    );
    const monthSpend = feed.rows
      .filter((r) => r.direction === "out")
      .reduce((s, r) => s + r.amount, 0);
    expect(monthSpend).toBe(71);
  });

  it("most-recent out row (latest expense) can be a withdrawal", () => {
    const feed = getActivityFeed(
      ctx({
        entries: [
          expenseEntry({ id: "old", amount: 200 }),
          bankWithdrawal(1, 14),
        ],
      }),
    );
    expect(feed.rows[0]?.amount).toBe(1);
    expect(feed.rows[0]?.isWithdrawal).toBe(true);
  });
});

describe("getActivityFeed — exclusions", () => {
  it("recurring rules never appear", () => {
    const r: RecurringRule = {
      id: "r-1",
      label: "rent",
      category: "bills",
      estimatedAmount: 4000,
      dayOfMonth: 1,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const feed = getActivityFeed(ctx({ rules: [r] }));
    expect(feed.rows).toHaveLength(0);
  });

  it("loans never appear", () => {
    const l: Loan = {
      id: "l-1",
      label: "loan",
      monthlyInstallment: 1000,
      dayOfMonth: 5,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const feed = getActivityFeed(ctx({ loans: [l] }));
    expect(feed.rows).toHaveLength(0);
  });

  it("past purchase installment slices do not emit rows in future months", () => {
    // ₪600 in 3 installments purchased two months ago (April 2026).
    // Slice fires this month (June) and last month (May) — neither
    // should appear in the activity feed since the activity event
    // happened in April.
    const purchasedApril = expenseEntry({
      id: "april-tv",
      amount: 600,
      installments: 3,
      chargeDate: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
      occurredAt: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
      createdAt: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
    });
    const feed = getActivityFeed(ctx({ entries: [purchasedApril] }));
    expect(feed.rows).toHaveLength(0);
  });

  it("purchase made THIS month emits exactly one row with the activity amount", () => {
    const tv = expenseEntry({
      id: "june-tv",
      amount: 600,
      installments: 3,
    });
    const feed = getActivityFeed(ctx({ entries: [tv] }));
    expect(feed.rows).toHaveLength(1);
    expect(feed.rows[0].direction).toBe("out");
  });
});
