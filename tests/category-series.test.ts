import { describe, expect, it } from "vitest";
import { categoryMonthlySeries } from "@/lib/forecast";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 5, 12, 0, 0).toISOString(),
    merchant: "Shufersal",
    ...overrides,
  };
}

describe("categoryMonthlySeries", () => {
  it("returns oldest → newest with correct totals", () => {
    const entries: ExpenseEntry[] = [
      entry({ amount: 100, chargeDate: new Date(2026, 0, 5).toISOString() }),
      entry({ amount: 200, chargeDate: new Date(2026, 2, 5).toISOString() }),
      entry({ amount: 50, chargeDate: new Date(2026, 2, 18).toISOString() }),
      entry({ amount: 400, chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const series = categoryMonthlySeries({
      entries,
      category: "food",
      monthKey: "2026-05",
      monthsBack: 6,
    });
    expect(series.length).toBe(6);
    expect(series[0].monthKey).toBe("2025-12");
    expect(series[5].monthKey).toBe("2026-05");
    expect(series[1].total).toBe(100); // Jan
    expect(series[3].total).toBe(250); // Mar
    expect(series[5].total).toBe(400); // May
  });

  it("ignores other categories", () => {
    const entries: ExpenseEntry[] = [
      entry({
        amount: 200,
        category: "transport",
        chargeDate: new Date(2026, 4, 5).toISOString(),
      }),
      entry({
        amount: 50,
        category: "food",
        chargeDate: new Date(2026, 4, 5).toISOString(),
      }),
    ];
    const series = categoryMonthlySeries({
      entries,
      category: "food",
      monthKey: "2026-05",
      monthsBack: 1,
    });
    expect(series[0].total).toBe(50);
  });

  it("skips needsConfirmation / bankPending / refund / FX entries", () => {
    const entries: ExpenseEntry[] = [
      entry({
        amount: 100,
        chargeDate: new Date(2026, 4, 5).toISOString(),
        needsConfirmation: true,
      }),
      entry({
        amount: 200,
        chargeDate: new Date(2026, 4, 5).toISOString(),
        bankPending: true,
      }),
      entry({
        amount: 300,
        chargeDate: new Date(2026, 4, 5).toISOString(),
        isRefund: true,
      }),
      entry({
        amount: 400,
        chargeDate: new Date(2026, 4, 5).toISOString(),
        currency: "USD",
      }),
      entry({
        amount: 50,
        chargeDate: new Date(2026, 4, 5).toISOString(),
      }),
    ];
    const series = categoryMonthlySeries({
      entries,
      category: "food",
      monthKey: "2026-05",
      monthsBack: 1,
    });
    expect(series[0].total).toBe(50);
  });

  it("clamps monthsBack to [1, 24]", () => {
    expect(
      categoryMonthlySeries({
        entries: [],
        category: "food",
        monthKey: "2026-05",
        monthsBack: 0,
      }).length,
    ).toBe(1);
    expect(
      categoryMonthlySeries({
        entries: [],
        category: "food",
        monthKey: "2026-05",
        monthsBack: 99,
      }).length,
    ).toBe(24);
  });
});
