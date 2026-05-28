// Phase 266 — Auto budgetMode is a valid setup. Validators must NOT
// nag the user to set monthlyBudget while Auto is selected.

import { describe, expect, it } from "vitest";

import { gatherSmartInsights } from "@/lib/smart-insights";
import type {
  Account,
  ExpenseEntry,
  Income,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "cash",
    installments: 1,
    chargeDate: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    ...o,
  };
}

const NOW: ConstructorParameters<typeof Date>[0] = "2026-06-04T12:00:00.000Z";

const baseArgs = {
  entries: [
    entry({ id: "a", amount: 2000, chargeDate: "2026-03-10T12:00:00.000Z" }),
    entry({ id: "b", amount: 2200, chargeDate: "2026-04-10T12:00:00.000Z" }),
    entry({ id: "c", amount: 1900, chargeDate: "2026-05-10T12:00:00.000Z" }),
  ] as ExpenseEntry[],
  rules: [] as RecurringRule[],
  statuses: [] as RecurringStatus[],
  accounts: [] as Account[],
  incomes: [] as Income[],
  monthKey: "2026-06",
};

describe("gatherSmartInsights — Auto mode suppresses budget recommendation", () => {
  it("Manual + monthlyBudget=0 → recommendation is actionable", () => {
    const out = gatherSmartInsights({
      ...baseArgs,
      monthlyBudget: 0,
      budgetMode: "manual",
    });
    expect(out.budgetRecommendationAvailable).toBe(true);
    expect(out.total).toBeGreaterThan(0);
  });

  it("Auto + monthlyBudget=0 → recommendation suppressed", () => {
    const out = gatherSmartInsights({
      ...baseArgs,
      monthlyBudget: 0,
      budgetMode: "auto",
    });
    expect(out.budgetRecommendationAvailable).toBe(false);
  });

  it("Auto + monthlyBudget>0 still suppresses recommendation", () => {
    const out = gatherSmartInsights({
      ...baseArgs,
      monthlyBudget: 5000,
      budgetMode: "auto",
    });
    expect(out.budgetRecommendationAvailable).toBe(false);
  });

  it("Manual + monthlyBudget that diverges from recommendation → still surfaces", () => {
    const out = gatherSmartInsights({
      ...baseArgs,
      monthlyBudget: 500, // way below the ~2k spend average
      budgetMode: "manual",
    });
    expect(out.budgetRecommendationAvailable).toBe(true);
  });

  it("default (no budgetMode arg) behaves like manual — backwards compat", () => {
    const out = gatherSmartInsights({
      ...baseArgs,
      monthlyBudget: 0,
    });
    // No budgetMode passed → recommendation actionable like manual.
    expect(out.budgetRecommendationAvailable).toBe(true);
  });
});

void NOW;
