import { describe, expect, it } from "vitest";

import { summarizeRefunds } from "@/lib/refund-summary";
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

describe("summarizeRefunds", () => {
  it("returns zeros when there are no refunds", () => {
    const out = summarizeRefunds({ entries: [entry()], monthKey: MAY });
    expect(out.total).toBe(0);
    expect(out.count).toBe(0);
    expect(out.topRefunds).toHaveLength(0);
  });

  it("sums refund slices landing in the month", () => {
    const entries = [
      entry({
        isRefund: true,
        amount: 80,
        merchant: "Returns Inc",
      }),
      entry({
        isRefund: true,
        amount: 35,
        merchant: "Cafe Refund",
      }),
    ];
    const out = summarizeRefunds({ entries, monthKey: MAY });
    expect(out.total).toBe(115);
    expect(out.count).toBe(2);
  });

  it("returns top refunds sorted by amount desc", () => {
    const entries = [
      entry({ isRefund: true, amount: 30, merchant: "A" }),
      entry({ isRefund: true, amount: 90, merchant: "B" }),
      entry({ isRefund: true, amount: 50, merchant: "C" }),
      entry({ isRefund: true, amount: 200, merchant: "D" }),
    ];
    const out = summarizeRefunds({ entries, monthKey: MAY });
    expect(out.topRefunds.map((r) => r.merchant)).toEqual([
      "D",
      "B",
      "C",
    ]);
  });

  it("skips needsConfirmation / bankPending / excludeFromBudget", () => {
    const entries = [
      entry({ isRefund: true, amount: 100, needsConfirmation: true }),
      entry({ isRefund: true, amount: 100, bankPending: true }),
      entry({ isRefund: true, amount: 100, excludeFromBudget: true }),
      entry({ isRefund: true, amount: 75 }),
    ];
    const out = summarizeRefunds({ entries, monthKey: MAY });
    expect(out.total).toBe(75);
    expect(out.count).toBe(1);
  });

  it("ignores non-refund entries", () => {
    const entries = [
      entry({ amount: 1000 }),
      entry({ isRefund: true, amount: 50 }),
    ];
    const out = summarizeRefunds({ entries, monthKey: MAY });
    expect(out.total).toBe(50);
  });
});
