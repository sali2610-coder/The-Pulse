import { describe, expect, it } from "vitest";

import { recommendBudget } from "@/lib/budget-recommendation";
import type { ExpenseEntry, MonthKey } from "@/types/finance";

const MAY: MonthKey = "2026-05";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 1).toISOString(),
    createdAt: new Date(2026, 4, 1).toISOString(),
    ...overrides,
  };
}

describe("recommendBudget", () => {
  it("returns zero when there is no history", () => {
    const rec = recommendBudget({ entries: [], monthKey: MAY });
    expect(rec.recommended).toBe(0);
    expect(rec.hasEnoughData).toBe(false);
    expect(rec.lookbackMonths).toBe(0);
  });

  it("returns median spend rounded to nearest ₪100 for stable history", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 1, 5).toISOString(),
        amount: 4920,
      }),
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 5050,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 4880,
      }),
    ];
    const rec = recommendBudget({ entries, monthKey: MAY });
    expect(rec.lookbackMonths).toBe(3);
    expect(rec.recommended).toBe(4900);
    expect(rec.hasEnoughData).toBe(true);
    expect(rec.variability).toBeLessThan(0.25);
  });

  it("pads the median by 10% when variability is high", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 1, 5).toISOString(),
        amount: 2000,
      }),
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 4000,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 8000,
      }),
    ];
    const rec = recommendBudget({ entries, monthKey: MAY });
    expect(rec.variability).toBeGreaterThan(0.25);
    // Median 4000 * 1.1 = 4400 → rounds to 4400.
    expect(rec.recommended).toBe(4400);
  });

  it("excludes refunds and excludeFromBudget entries", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 1000,
      }),
      entry({
        chargeDate: new Date(2026, 2, 6).toISOString(),
        amount: 500,
        isRefund: true,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 1000,
      }),
      entry({
        chargeDate: new Date(2026, 3, 6).toISOString(),
        amount: 500,
        excludeFromBudget: true,
      }),
    ];
    const rec = recommendBudget({ entries, monthKey: MAY });
    // Both months land at ₪1000, refunds/excludes ignored.
    expect(rec.monthlyTotals).toEqual([1000, 1000]);
  });

  it("clamps to a ₪500 floor", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 80,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 80,
      }),
    ];
    const rec = recommendBudget({ entries, monthKey: MAY });
    expect(rec.recommended).toBe(500);
  });

  it("ignores entries still awaiting confirmation", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 2000,
        needsConfirmation: true,
      }),
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 1000,
      }),
    ];
    const rec = recommendBudget({ entries, monthKey: MAY });
    expect(rec.monthlyTotals).toEqual([1000]);
  });
});
