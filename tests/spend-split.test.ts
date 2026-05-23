import { describe, expect, it } from "vitest";

import { bucketFor, spendSplit } from "@/lib/spend-split";
import type { ExpenseEntry } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    ...o,
  };
}

describe("bucketFor", () => {
  it("essentials list", () => {
    expect(bucketFor("food")).toBe("essentials");
    expect(bucketFor("transport")).toBe("essentials");
    expect(bucketFor("bills")).toBe("essentials");
    expect(bucketFor("health")).toBe("essentials");
    expect(bucketFor("education")).toBe("essentials");
  });

  it("discretionary list", () => {
    expect(bucketFor("shopping")).toBe("discretionary");
    expect(bucketFor("entertainment")).toBe("discretionary");
    expect(bucketFor("gifts")).toBe("discretionary");
    expect(bucketFor("other")).toBe("discretionary");
  });
});

describe("spendSplit", () => {
  it("empty entries → zero everything, shares 0", () => {
    const s = spendSplit({ entries: [], monthKey: "2026-05" });
    expect(s.essentials).toBe(0);
    expect(s.discretionary).toBe(0);
    expect(s.essentialShare).toBe(0);
    expect(s.discretionaryShare).toBe(0);
  });

  it("partitions by category", () => {
    const s = spendSplit({
      entries: [
        entry({ amount: 300, category: "food" }),
        entry({ amount: 100, category: "bills" }),
        entry({ amount: 250, category: "entertainment" }),
        entry({ amount: 50, category: "shopping" }),
      ],
      monthKey: "2026-05",
    });
    expect(s.essentials).toBe(400);
    expect(s.discretionary).toBe(300);
    expect(s.total).toBe(700);
    expect(s.essentialShare).toBeCloseTo(400 / 700, 5);
    expect(s.discretionaryShare).toBeCloseTo(300 / 700, 5);
  });

  it("ignores refund / pending / non-ILS / excluded", () => {
    const s = spendSplit({
      entries: [
        entry({ amount: 100, category: "food", isRefund: true }),
        entry({ amount: 100, category: "food", bankPending: true }),
        entry({ amount: 100, category: "food", needsConfirmation: true }),
        entry({ amount: 100, category: "food", currency: "USD" }),
        entry({ amount: 100, category: "food", excludeFromBudget: true }),
        entry({ amount: 100, category: "food" }),
      ],
      monthKey: "2026-05",
    });
    expect(s.essentials).toBe(100);
  });

  it("uses slice amount for installments", () => {
    const s = spendSplit({
      entries: [
        entry({
          amount: 1200,
          installments: 12,
          category: "entertainment",
          chargeDate: new Date(2026, 0, 10).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(s.discretionary).toBe(100);
  });
});
