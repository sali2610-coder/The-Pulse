import { describe, expect, it } from "vitest";

import { categoryPareto } from "@/lib/category-pareto";
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

describe("categoryPareto", () => {
  it("empty entries → empty result", () => {
    const r = categoryPareto({
      entries: [],
      monthKey: "2026-05",
    });
    expect(r.total).toBe(0);
    expect(r.rows).toEqual([]);
    expect(r.dominant).toEqual([]);
    expect(r.headlineShare).toBe(0);
  });

  it("rows sorted by total DESC", () => {
    const r = categoryPareto({
      entries: [
        entry({ amount: 100, category: "food" }),
        entry({ amount: 500, category: "shopping" }),
        entry({ amount: 200, category: "transport" }),
      ],
      monthKey: "2026-05",
    });
    expect(r.rows.map((x) => x.category)).toEqual([
      "shopping",
      "transport",
      "food",
    ]);
    expect(r.total).toBe(800);
  });

  it("dominant set = smallest cumulative ≥ threshold", () => {
    const r = categoryPareto({
      entries: [
        entry({ amount: 700, category: "shopping" }), // 70%
        entry({ amount: 200, category: "transport" }), // 20%
        entry({ amount: 100, category: "food" }), // 10%
      ],
      monthKey: "2026-05",
      threshold: 0.8,
    });
    expect(r.dominant.map((x) => x.category)).toEqual([
      "shopping",
      "transport",
    ]);
    expect(r.headlineShare).toBeCloseTo(0.9, 5);
  });

  it("dominant set is just the top when single category crosses", () => {
    const r = categoryPareto({
      entries: [
        entry({ amount: 900, category: "bills" }),
        entry({ amount: 100, category: "food" }),
      ],
      monthKey: "2026-05",
      threshold: 0.8,
    });
    expect(r.dominant.map((x) => x.category)).toEqual(["bills"]);
    expect(r.headlineShare).toBeCloseTo(0.9, 5);
  });

  it("threshold 1.0 returns every non-zero row", () => {
    const r = categoryPareto({
      entries: [
        entry({ amount: 100, category: "food" }),
        entry({ amount: 100, category: "transport" }),
        entry({ amount: 100, category: "shopping" }),
      ],
      monthKey: "2026-05",
      threshold: 1,
    });
    expect(r.dominant).toHaveLength(3);
  });

  it("noisy entries excluded", () => {
    const r = categoryPareto({
      entries: [
        entry({ amount: 999, isRefund: true }),
        entry({ amount: 999, bankPending: true }),
        entry({ amount: 999, needsConfirmation: true }),
        entry({ amount: 999, currency: "USD" }),
        entry({ amount: 999, excludeFromBudget: true }),
        entry({ amount: 100 }),
      ],
      monthKey: "2026-05",
    });
    expect(r.total).toBe(100);
    expect(r.dominant).toHaveLength(1);
  });

  it("installment slices count at slice amount", () => {
    const r = categoryPareto({
      entries: [
        entry({
          amount: 1200,
          installments: 12,
          chargeDate: new Date(2026, 0, 10).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(r.total).toBe(100);
  });
});
