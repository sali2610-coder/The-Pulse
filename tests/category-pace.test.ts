import { describe, expect, it } from "vitest";

import { categoryPace } from "@/lib/category-pace";
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

describe("categoryPace", () => {
  it("empty entries → no rows", () => {
    const rows = categoryPace({
      entries: [],
      monthKey: "2026-05",
      now: new Date(2026, 4, 15),
    });
    expect(rows).toEqual([]);
  });

  it("projects EOM linearly from pace", () => {
    // Day 10 of 31. Spent 300. Projected = 300 × 31 / 10 = 930.
    const rows = categoryPace({
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 5).toISOString(),
          amount: 100,
          category: "food",
        }),
        entry({
          chargeDate: new Date(2026, 4, 8).toISOString(),
          amount: 200,
          category: "food",
        }),
      ],
      monthKey: "2026-05",
      now: new Date(2026, 4, 10, 12, 0, 0),
    });
    const food = rows.find((r) => r.category === "food")!;
    expect(food.spentSoFar).toBe(300);
    expect(food.projectedEOM).toBeCloseTo(930, 5);
  });

  it("computes prior median across lookback months", () => {
    const rows = categoryPace({
      entries: [
        // April food: 600
        entry({
          chargeDate: new Date(2026, 3, 10).toISOString(),
          amount: 600,
          category: "food",
        }),
        // March food: 300
        entry({
          chargeDate: new Date(2026, 2, 10).toISOString(),
          amount: 300,
          category: "food",
        }),
        // February food: 900
        entry({
          chargeDate: new Date(2026, 1, 10).toISOString(),
          amount: 900,
          category: "food",
        }),
      ],
      monthKey: "2026-05",
      now: new Date(2026, 4, 15),
    });
    const food = rows.find((r) => r.category === "food")!;
    // Median of [600, 300, 900] = 600.
    expect(food.priorMedian).toBe(600);
  });

  it("deltaVsPrior = projectedEOM - priorMedian", () => {
    // Current pace projects 1000; prior median 400 → delta +600.
    const rows = categoryPace({
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 1).toISOString(),
          amount: 1000,
          category: "transport",
        }),
        entry({
          chargeDate: new Date(2026, 3, 10).toISOString(),
          amount: 400,
          category: "transport",
        }),
        entry({
          chargeDate: new Date(2026, 2, 10).toISOString(),
          amount: 400,
          category: "transport",
        }),
      ],
      monthKey: "2026-05",
      now: new Date(2026, 4, 31, 23, 0, 0),
    });
    const t = rows.find((r) => r.category === "transport")!;
    expect(Math.round(t.projectedEOM)).toBe(1000);
    expect(t.priorMedian).toBe(400);
    expect(Math.round(t.deltaVsPrior)).toBe(600);
  });

  it("excludes refunds + needsConfirmation + non-ILS", () => {
    const rows = categoryPace({
      entries: [
        entry({ amount: 100, isRefund: true }),
        entry({ amount: 100, needsConfirmation: true }),
        entry({ amount: 100, currency: "USD" }),
        entry({ amount: 100 }),
      ],
      monthKey: "2026-05",
      now: new Date(2026, 4, 10, 12, 0, 0),
    });
    const food = rows.find((r) => r.category === "food")!;
    expect(food.spentSoFar).toBe(100);
  });

  it("non-current month: counts whole month, no pace truncation", () => {
    // April was a past month at "now" = May 15 → uptoMs is undefined
    // so all April slices count; day = last day of April (30).
    const rows = categoryPace({
      entries: [
        entry({
          chargeDate: new Date(2026, 3, 20).toISOString(),
          amount: 500,
          category: "shopping",
        }),
      ],
      monthKey: "2026-04",
      now: new Date(2026, 4, 15),
    });
    const s = rows.find((r) => r.category === "shopping")!;
    expect(s.spentSoFar).toBe(500);
    // Day = 30 (days in April), last = 30 → projection equals spent.
    expect(s.projectedEOM).toBe(500);
  });

  it("sorts by projectedEOM DESC", () => {
    const rows = categoryPace({
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 5).toISOString(),
          amount: 50,
          category: "food",
        }),
        entry({
          chargeDate: new Date(2026, 4, 5).toISOString(),
          amount: 500,
          category: "shopping",
        }),
      ],
      monthKey: "2026-05",
      now: new Date(2026, 4, 10, 12, 0, 0),
    });
    expect(rows[0].category).toBe("shopping");
  });
});
