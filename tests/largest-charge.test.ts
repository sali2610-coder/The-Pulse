import { describe, expect, it } from "vitest";

import { findLargestCharge } from "@/lib/largest-charge";
import type { ExpenseEntry, MonthKey } from "@/types/finance";

const MAY: MonthKey = "2026-05";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    ...overrides,
  };
}

describe("findLargestCharge", () => {
  it("returns null when nothing landed this month", () => {
    expect(findLargestCharge({ entries: [], monthKey: MAY })).toBeNull();
  });

  it("picks the single biggest charge slice", () => {
    const entries = [
      entry({ amount: 100 }),
      entry({ amount: 350, merchant: "Big spend" }),
      entry({ amount: 80 }),
    ];
    const out = findLargestCharge({ entries, monthKey: MAY })!;
    expect(out.amount).toBe(350);
    expect(out.merchant).toBe("Big spend");
  });

  it("uses the per-month slice for installment plans", () => {
    const entries = [
      entry({
        amount: 1200,
        installments: 12,
        chargeDate: new Date(2026, 0, 5).toISOString(),
      }),
      entry({ amount: 250, merchant: "single" }),
    ];
    const out = findLargestCharge({ entries, monthKey: MAY })!;
    expect(out.merchant).toBe("single");
  });

  it("ignores refunds / pending / excluded entries", () => {
    const entries = [
      entry({ amount: 900, isRefund: true }),
      entry({ amount: 800, bankPending: true }),
      entry({ amount: 800, needsConfirmation: true }),
      entry({ amount: 800, excludeFromBudget: true }),
      entry({ amount: 120, merchant: "winner" }),
    ];
    const out = findLargestCharge({ entries, monthKey: MAY })!;
    expect(out.merchant).toBe("winner");
  });
});
