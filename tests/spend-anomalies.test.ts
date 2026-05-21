import { describe, expect, it } from "vitest";

import { detectSpendAnomalies } from "@/lib/spend-anomalies";
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

describe("detectSpendAnomalies", () => {
  it("flags a category spending 3x its 3-month average", () => {
    const entries: ExpenseEntry[] = [
      // Prior months: ₪200 each.
      entry({ chargeDate: new Date(2026, 1, 5).toISOString(), amount: 200 }),
      entry({ chargeDate: new Date(2026, 2, 5).toISOString(), amount: 200 }),
      entry({ chargeDate: new Date(2026, 3, 5).toISOString(), amount: 200 }),
      // This month: ₪600.
      entry({ chargeDate: new Date(2026, 4, 5).toISOString(), amount: 600 }),
    ];
    const anomalies = detectSpendAnomalies({ entries, monthKey: MAY });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe("food");
    expect(anomalies[0].severity).toBe("alert");
    expect(anomalies[0].ratio).toBeCloseTo(3, 1);
  });

  it("classifies 1.6x as watch (not alert)", () => {
    const entries: ExpenseEntry[] = [
      entry({ chargeDate: new Date(2026, 1, 5).toISOString(), amount: 250 }),
      entry({ chargeDate: new Date(2026, 2, 5).toISOString(), amount: 250 }),
      entry({ chargeDate: new Date(2026, 3, 5).toISOString(), amount: 250 }),
      entry({ chargeDate: new Date(2026, 4, 5).toISOString(), amount: 400 }),
    ];
    const anomalies = detectSpendAnomalies({ entries, monthKey: MAY });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe("watch");
  });

  it("skips categories under the ₪100 floor", () => {
    const entries: ExpenseEntry[] = [
      entry({ chargeDate: new Date(2026, 1, 5).toISOString(), amount: 10 }),
      entry({ chargeDate: new Date(2026, 2, 5).toISOString(), amount: 10 }),
      entry({ chargeDate: new Date(2026, 3, 5).toISOString(), amount: 10 }),
      entry({ chargeDate: new Date(2026, 4, 5).toISOString(), amount: 50 }),
    ];
    expect(detectSpendAnomalies({ entries, monthKey: MAY })).toHaveLength(0);
  });

  it("skips categories with < 2 prior months of coverage", () => {
    const entries: ExpenseEntry[] = [
      // Only one prior month → can't form a stable baseline.
      entry({ chargeDate: new Date(2026, 3, 5).toISOString(), amount: 200 }),
      entry({ chargeDate: new Date(2026, 4, 5).toISOString(), amount: 800 }),
    ];
    expect(detectSpendAnomalies({ entries, monthKey: MAY })).toHaveLength(0);
  });

  it("sorts alerts before watch, then by delta desc", () => {
    const entries: ExpenseEntry[] = [
      // food: 200/200/200 → 800 (alert, 4x)
      entry({
        category: "food",
        chargeDate: new Date(2026, 1, 5).toISOString(),
        amount: 200,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 200,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 200,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 800,
      }),
      // transport: 300/300/300 → 500 (watch, 1.67x)
      entry({
        category: "transport",
        chargeDate: new Date(2026, 1, 5).toISOString(),
        amount: 300,
      }),
      entry({
        category: "transport",
        chargeDate: new Date(2026, 2, 5).toISOString(),
        amount: 300,
      }),
      entry({
        category: "transport",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 300,
      }),
      entry({
        category: "transport",
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 500,
      }),
    ];
    const anomalies = detectSpendAnomalies({ entries, monthKey: MAY });
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0].category).toBe("food");
    expect(anomalies[0].severity).toBe("alert");
    expect(anomalies[1].category).toBe("transport");
    expect(anomalies[1].severity).toBe("watch");
  });

  it("ignores categories that dropped vs prior", () => {
    const entries: ExpenseEntry[] = [
      entry({ chargeDate: new Date(2026, 1, 5).toISOString(), amount: 500 }),
      entry({ chargeDate: new Date(2026, 2, 5).toISOString(), amount: 500 }),
      entry({ chargeDate: new Date(2026, 3, 5).toISOString(), amount: 500 }),
      entry({ chargeDate: new Date(2026, 4, 5).toISOString(), amount: 200 }),
    ];
    expect(detectSpendAnomalies({ entries, monthKey: MAY })).toHaveLength(0);
  });
});
