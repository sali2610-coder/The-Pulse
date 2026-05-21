import { beforeEach, describe, expect, it } from "vitest";

import { gatherSmartInsights } from "@/lib/smart-insights";
import {
  clearInsightDismissals,
  dismissInsight,
} from "@/lib/insight-dismiss";
import type {
  Account,
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

beforeEach(() => {
  clearInsightDismissals();
});

const MAY: MonthKey = "2026-05";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 70,
    category: "entertainment",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10).toISOString(),
    createdAt: new Date(2026, 4, 10).toISOString(),
    merchant: "Netflix",
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "חוק",
    category: "bills",
    estimatedAmount: 200,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paid(monthKey: MonthKey, ruleId: string, amount?: number): RecurringStatus {
  return {
    ruleId,
    monthKey,
    status: "paid",
    actualAmount: amount,
  };
}

describe("gatherSmartInsights", () => {
  it("returns zero totals when nothing is surfaceable", () => {
    const out = gatherSmartInsights({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(out.total).toBe(0);
    expect(out.budgetRecommendationAvailable).toBe(false);
  });

  it("counts a subscription candidate", () => {
    const entries = [
      entry({ chargeDate: new Date(2026, 1, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
    ];
    const out = gatherSmartInsights({
      entries,
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(out.subscriptionCount).toBe(1);
    expect(out.total).toBeGreaterThanOrEqual(1);
  });

  it("counts rule drift when actual >> estimate", () => {
    const r = rule({ estimatedAmount: 70, label: "Netflix" });
    const out = gatherSmartInsights({
      entries: [],
      rules: [r],
      statuses: [
        paid("2026-04", r.id, 70),
        paid("2026-05", r.id, 105),
      ],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(out.ruleDriftCount).toBe(1);
  });

  it("counts dormant rules", () => {
    const r = rule({ id: "old-gym" });
    const out = gatherSmartInsights({
      entries: [],
      rules: [r],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(out.dormantCount).toBe(1);
  });

  it("flags budget recommendation when current is zero + history exists", () => {
    const entries = [
      entry({
        category: "food",
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 3000,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 3000,
      }),
    ];
    const out = gatherSmartInsights({
      entries,
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 0,
      monthKey: MAY,
    });
    expect(out.budgetRecommendationAvailable).toBe(true);
    expect(out.total).toBeGreaterThanOrEqual(1);
  });

  it("subtracts dismissed insights from the count", () => {
    const entries = [
      entry({ chargeDate: new Date(2026, 1, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
    ];
    const before = gatherSmartInsights({
      entries,
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(before.subscriptionCount).toBe(1);
    dismissInsight("subscription", "netflix");
    const after = gatherSmartInsights({
      entries,
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(after.subscriptionCount).toBe(0);
    expect(after.total).toBeLessThan(before.total);
  });

  it("counts stale bank anchors", () => {
    const stale: Account = {
      id: "bank-1",
      kind: "bank",
      label: "Discount",
      anchorBalance: 5000,
      anchorUpdatedAt: new Date(
        Date.now() - 40 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      active: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const out = gatherSmartInsights({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [stale],
      incomes: [],
      monthlyBudget: 5000,
      monthKey: MAY,
    });
    expect(out.staleAnchorCount).toBe(1);
    expect(out.total).toBeGreaterThanOrEqual(1);
  });

  it("does not flag budget recommendation when current is close to history", () => {
    const entries = [
      entry({
        category: "food",
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 3000,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 3000,
      }),
    ];
    const out = gatherSmartInsights({
      entries,
      rules: [],
      statuses: [],
      accounts: [],
      incomes: [],
      monthlyBudget: 3000,
      monthKey: MAY,
    });
    expect(out.budgetRecommendationAvailable).toBe(false);
  });
});
