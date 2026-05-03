import { describe, expect, it } from "vitest";
import {
  forecastMonthEnd,
  categoryTrends,
  monthOverMonthTotals,
} from "@/lib/forecast";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "auto",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    ...overrides,
  };
}

describe("forecastMonthEnd", () => {
  it("projects flat budget when there are no expenses", () => {
    const f = forecastMonthEnd({
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 10), // 10th of May
    });
    expect(f.projectedTotal).toBe(0);
    expect(f.variance).toBe(-5000);
    expect(f.breachDay).toBeUndefined();
    expect(f.confidence).toBe("medium"); // 10 days observed, no history
  });

  it("extrapolates today's burn rate to end of month", () => {
    // Spend 1000 over first 10 days → 100/day → projected 3100 over 31 days.
    const entries = [
      entry({ amount: 1000, chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const f = forecastMonthEnd({
      entries,
      rules: [],
      statuses: [],
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 10),
    });
    expect(f.dailyBurn).toBe(100);
    // 1000 actual + 21 remaining * 100 = 3100
    expect(Math.round(f.projectedTotal)).toBe(3100);
    expect(f.variance).toBeLessThan(0);
  });

  it("flags a breach day when burn rate exhausts the budget early", () => {
    const entries = [
      entry({ amount: 2500, chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const f = forecastMonthEnd({
      entries,
      rules: [],
      statuses: [],
      monthlyBudget: 3000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 5), // day 5, 2500 already spent → 500/day
    });
    expect(f.breachDay).toBeDefined();
    expect(f.breachDay).toBeLessThanOrEqual(31);
  });

  it("compares pace to historical baseline", () => {
    const may = new Date(2026, 4, 5).toISOString();
    const apr = new Date(2026, 3, 5).toISOString();
    const mar = new Date(2026, 2, 5).toISOString();

    const entries = [
      entry({ amount: 600, chargeDate: may }), // current
      entry({ amount: 400, chargeDate: apr }), // historical
      entry({ amount: 400, chargeDate: mar }), // historical
    ];
    const f = forecastMonthEnd({
      entries,
      rules: [],
      statuses: [],
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 5),
    });
    expect(f.historicalDailyBurn).not.toBeNull();
    expect(f.paceVsHistorical).not.toBeNull();
    // 600 / 5d = 120 vs 400/5d = 80 → +50%
    expect(Math.round(f.paceVsHistorical!)).toBe(50);
  });

  it("reports low confidence early in the month with no history", () => {
    const entries = [
      entry({ amount: 50, chargeDate: new Date(2026, 4, 1).toISOString() }),
    ];
    const f = forecastMonthEnd({
      entries,
      rules: [],
      statuses: [],
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: new Date(2026, 4, 2),
    });
    expect(f.confidence).toBe("low");
  });
});

describe("categoryTrends", () => {
  it("computes delta vs prior-months average", () => {
    const entries = [
      // This month food = 200
      entry({ amount: 200, category: "food", chargeDate: new Date(2026, 4, 5).toISOString() }),
      // Last 2 months food = 100 + 300 → avg 200
      entry({ amount: 100, category: "food", chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ amount: 300, category: "food", chargeDate: new Date(2026, 2, 5).toISOString() }),
    ];
    const t = categoryTrends({
      entries,
      monthKey: "2026-05",
    });
    const food = t.find((x) => x.category === "food");
    expect(food).toBeDefined();
    expect(food!.thisMonth).toBe(200);
    expect(food!.priorAverage).toBe(200);
    expect(food!.delta).toBe(0);
  });

  it("excludes categories with zero in both periods", () => {
    const entries = [
      entry({ amount: 100, category: "food", chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const t = categoryTrends({ entries, monthKey: "2026-05" });
    expect(t.some((x) => x.category === "shopping")).toBe(false);
  });
});

describe("monthOverMonthTotals", () => {
  it("returns the requested number of months in chronological order", () => {
    const entries = [
      entry({ amount: 100, chargeDate: new Date(2026, 4, 5).toISOString() }),
      entry({ amount: 200, chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ amount: 300, chargeDate: new Date(2026, 2, 5).toISOString() }),
    ];
    const r = monthOverMonthTotals({
      entries,
      monthKey: "2026-05",
      count: 3,
    });
    expect(r.length).toBe(3);
    expect(r.map((x) => x.monthKey)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(r.map((x) => x.total)).toEqual([300, 200, 100]);
  });
});
