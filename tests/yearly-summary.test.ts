import { describe, expect, it } from "vitest";

import { yearlySummary } from "@/lib/yearly-summary";
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

const END = new Date(2026, 4, 15, 12, 0, 0); // May 15 2026

function daysAgo(n: number): string {
  return new Date(END.getTime() - n * 86_400_000).toISOString();
}

describe("yearlySummary", () => {
  it("empty entries → zeroes", () => {
    const s = yearlySummary({ entries: [], end: END });
    expect(s.totalSpent).toBe(0);
    expect(s.refundCredit).toBe(0);
    expect(s.netSpent).toBe(0);
    expect(s.topCategory).toBeNull();
    expect(s.topMerchant).toBeNull();
    expect(s.chargesCount).toBe(0);
  });

  it("counts only entries inside the rolling 365-day window", () => {
    const s = yearlySummary({
      entries: [
        entry({ amount: 100, chargeDate: daysAgo(30) }),
        entry({ amount: 200, chargeDate: daysAgo(360) }),
        entry({ amount: 999, chargeDate: daysAgo(400) }), // outside
      ],
      end: END,
    });
    expect(s.totalSpent).toBe(300);
    expect(s.chargesCount).toBe(2);
  });

  it("refunds bucket separately, netSpent = total - refunds", () => {
    const s = yearlySummary({
      entries: [
        entry({ amount: 500, chargeDate: daysAgo(10) }),
        entry({ amount: 80, chargeDate: daysAgo(5), isRefund: true }),
      ],
      end: END,
    });
    expect(s.totalSpent).toBe(500);
    expect(s.refundCredit).toBe(80);
    expect(s.netSpent).toBe(420);
  });

  it("topCategory picks the highest net category", () => {
    const s = yearlySummary({
      entries: [
        entry({ amount: 200, chargeDate: daysAgo(10), category: "food" }),
        entry({ amount: 800, chargeDate: daysAgo(10), category: "shopping" }),
        entry({ amount: 300, chargeDate: daysAgo(10), category: "shopping" }),
      ],
      end: END,
    });
    expect(s.topCategory?.category).toBe("shopping");
    expect(s.topCategory?.total).toBe(1100);
  });

  it("topMerchant picks the highest by name", () => {
    const s = yearlySummary({
      entries: [
        entry({ amount: 50, chargeDate: daysAgo(10), merchant: "ארומה" }),
        entry({ amount: 200, chargeDate: daysAgo(10), merchant: "ארומה" }),
        entry({ amount: 1000, chargeDate: daysAgo(10), merchant: "איקאה" }),
      ],
      end: END,
    });
    expect(s.topMerchant?.merchant).toBe("איקאה");
    expect(s.topMerchant?.total).toBe(1000);
  });

  it("excludes noisy entries", () => {
    const s = yearlySummary({
      entries: [
        entry({ amount: 100, chargeDate: daysAgo(10), needsConfirmation: true }),
        entry({ amount: 100, chargeDate: daysAgo(10), bankPending: true }),
        entry({ amount: 100, chargeDate: daysAgo(10), excludeFromBudget: true }),
        entry({ amount: 100, chargeDate: daysAgo(10), currency: "USD" }),
        entry({ amount: 100, chargeDate: daysAgo(10) }),
      ],
      end: END,
    });
    expect(s.totalSpent).toBe(100);
  });

  it("installment slices fall in the window at slice amount", () => {
    // 6-month plan starting Dec 2025 at 600 → 100/m. Window
    // spans May 2025 → May 2026 inclusive. Slices: Dec 2025
    // through May 2026 (6 months, all in window).
    const s = yearlySummary({
      entries: [
        entry({
          amount: 600,
          installments: 6,
          chargeDate: new Date(2025, 11, 10).toISOString(),
        }),
      ],
      end: END,
    });
    expect(s.totalSpent).toBe(600);
    expect(s.chargesCount).toBe(6);
  });

  it("monthsWithSpend counts distinct months that had a slice", () => {
    // Pick widely-spaced dates: ~10 / ~70 / ~130 days ago → 3 distinct
    // calendar months for any reasonable host TZ.
    const s = yearlySummary({
      entries: [
        entry({ amount: 100, chargeDate: daysAgo(10) }),
        entry({ amount: 100, chargeDate: daysAgo(70) }),
        entry({ amount: 100, chargeDate: daysAgo(130) }),
      ],
      end: END,
    });
    expect(s.monthsWithSpend).toBe(3);
  });

  it("monthlyAverage = netSpent ÷ 12 and dailyAverage = netSpent ÷ 365", () => {
    const s = yearlySummary({
      entries: [entry({ amount: 36500, chargeDate: daysAgo(30) })],
      end: END,
    });
    expect(s.monthlyAverage).toBeCloseTo(36500 / 12, 5);
    expect(s.dailyAverage).toBe(100);
  });
});
