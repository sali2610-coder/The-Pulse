// Phase 282 — financial health score contract.
//
// Locks the tone bucketing and the refinement deltas so the Home
// gauge never drifts away from the rest of the dashboard's
// riskLevel-driven coloring.

import { describe, expect, it } from "vitest";

import { financialHealthScore } from "@/lib/financial-health-score";
import type { FinancialSnapshot } from "@/lib/financial-snapshot";

function snap(o: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    monthKey: "2026-05",
    totalDays: 31,
    today: 15,
    daysRemaining: 17,
    currentBalance: 10_000,
    expectedIncomeUntilNextMonth: 12_000,
    fixedExpensesUntilNextMonth: 0,
    activeLoansPaymentsUntilNextMonth: 0,
    installmentPaymentsUntilNextMonth: 0,
    recurringCommitmentsUntilNextMonth: 0,
    actualSpentThisMonth: 0,
    monthlyBudget: 0,
    remainingBudgetThisMonth: 0,
    remainingPlannedSpending: 0,
    projectedBalanceOnFirstOfNextMonth: 8_000,
    projectedBalanceWithoutDiscretionary: 8_000,
    safeToSpendUntilMonthEnd: 8_000,
    dailySafeToSpend: 470,
    expectedOverdraft: 0,
    riskLevel: "safe",
    ...o,
  } as FinancialSnapshot;
}

describe("financialHealthScore — buckets", () => {
  it("maps overdraft → danger band", () => {
    const out = financialHealthScore(
      snap({
        riskLevel: "overdraft",
        currentBalance: 0,
        projectedBalanceWithoutDiscretionary: -2000,
      }),
    );
    expect(out.tone).toBe("danger");
    expect(out.score).toBeLessThan(40);
    expect(out.label).toBe("סיכון תזרימי");
  });

  it("maps safe → ok band", () => {
    const out = financialHealthScore(snap());
    expect(out.tone).toBe("ok");
    expect(out.score).toBeGreaterThanOrEqual(70);
    expect(out.label).toBe("בריא");
  });

  it("watch sits between, lower than safe", () => {
    // Same anchor depth on both so the bucket is the only differentiator.
    const safe = financialHealthScore(
      snap({ riskLevel: "safe", currentBalance: 2_000 }),
    );
    const watch = financialHealthScore(
      snap({ riskLevel: "watch", currentBalance: 2_000 }),
    );
    expect(watch.score).toBeLessThan(safe.score);
    expect(watch.tone).toBe("watch");
  });

  it("tight sits below watch", () => {
    const watch = financialHealthScore(snap({ riskLevel: "watch" }));
    const tight = financialHealthScore(snap({ riskLevel: "tight" }));
    expect(tight.score).toBeLessThan(watch.score);
  });
});

describe("financialHealthScore — refinement", () => {
  it("negative projected balance penalty stacks", () => {
    const mild = financialHealthScore(
      snap({
        riskLevel: "overdraft",
        currentBalance: 1_000,
        projectedBalanceWithoutDiscretionary: -1_000,
      }),
    );
    const deep = financialHealthScore(
      snap({
        riskLevel: "overdraft",
        currentBalance: 1_000,
        projectedBalanceWithoutDiscretionary: -20_000,
      }),
    );
    expect(deep.score).toBeLessThan(mild.score);
  });

  it("deeper anchor pushes the score up at the same risk bucket", () => {
    const small = financialHealthScore(
      snap({
        riskLevel: "safe",
        currentBalance: 2_000,
        projectedBalanceWithoutDiscretionary: 1_000,
      }),
    );
    const deep = financialHealthScore(
      snap({
        riskLevel: "safe",
        currentBalance: 60_000,
        projectedBalanceWithoutDiscretionary: 1_000,
      }),
    );
    expect(deep.score).toBeGreaterThan(small.score);
  });

  it("never escapes [0, 100]", () => {
    const out = financialHealthScore(
      snap({
        riskLevel: "overdraft",
        currentBalance: -5_000,
        projectedBalanceWithoutDiscretionary: -20_000,
      }),
    );
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
  });
});
