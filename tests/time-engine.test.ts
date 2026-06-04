// Phase 358 — TimeScreen engine adapter sanity tests.
//
// useTimeEngine is a hook; we can't run it under Vitest's plain
// runtime. Instead these tests exercise the same composition rules
// used inside the hook (curve + snapshot + checkpoints) against the
// underlying engines directly, so any regression in the surrounding
// engines that would break the hook gets caught here.

import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { forecastHealthScore } from "@/lib/forecast-health";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 12_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("TimeScreen engine composition", () => {
  it("liquidityCurve + snapshot + health surface the bits TimeScreen needs", () => {
    const accounts = [bank({ anchorBalance: 8_000 })];
    const loans: Loan[] = [];
    const incomes: Income[] = [
      {
        id: "i-1",
        label: "Salary",
        amount: 13_000,
        dayOfMonth: 1,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const entries: ExpenseEntry[] = [];
    const rules: RecurringRule[] = [];
    const statuses: RecurringStatus[] = [];

    const curve = liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays: 60,
    });

    expect(curve.points.length).toBeGreaterThan(0);
    expect(curve.startingBalance).toBe(8_000);
    // Some future inflow expected from monthly salary inside 60d window.
    expect(curve.totalInflow).toBeGreaterThan(0);

    const snap = buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget: 0,
      monthKey: `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, "0")}` as `${number}-${number}`,
    });
    expect(snap.currentBalance).toBe(8_000);

    const target = curve.points[Math.min(14, curve.points.length - 1)];
    const health = forecastHealthScore({
      startingBalance: curve.startingBalance,
      projectedBalance: target.balance,
      daysAhead: 14,
      deltaInflow: 0,
      deltaOutflow: 0,
      pendingCommitmentsCount: 0,
      openCreditTransactionsCount: 0,
      daysToNextSalary: null,
    });
    expect(health.band).toMatch(/safe|steady|watch|risk|danger/);
    expect(health.label.length).toBeGreaterThan(0);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it("curve handles a zero-anchor edge — TimeScreen renders empty state", () => {
    const accounts: Account[] = [];
    const curve = liquidityCurve({
      accounts,
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      windowDays: 60,
    });
    // No anchors → starting balance 0, curve still walks.
    expect(curve.startingBalance).toBe(0);
    expect(curve.points.length).toBeGreaterThan(0);
  });
});
