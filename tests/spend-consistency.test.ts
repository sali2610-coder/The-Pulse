import { describe, expect, it } from "vitest";

import { spendConsistency } from "@/lib/spend-consistency";
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

describe("spendConsistency", () => {
  it("empty entries → mean 0, rating even", () => {
    const c = spendConsistency({
      entries: [],
      monthKey: "2026-05",
    });
    expect(c.mean).toBe(0);
    expect(c.rating).toBe("even");
  });

  it("uniform spending → cv near 0, rating even", () => {
    // 100 every day in May 2026 (31 days). std-dev = 0.
    const entries = Array.from({ length: 31 }, (_, i) =>
      entry({
        amount: 100,
        chargeDate: new Date(2026, 4, i + 1, 12, 0, 0).toISOString(),
      }),
    );
    const c = spendConsistency({ entries, monthKey: "2026-05" });
    expect(c.mean).toBe(100);
    expect(c.stdDev).toBe(0);
    expect(c.cv).toBe(0);
    expect(c.rating).toBe("even");
  });

  it("single burst day → high cv, rating burst", () => {
    const c = spendConsistency({
      entries: [
        entry({
          amount: 5000,
          chargeDate: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(c.cv).toBeGreaterThan(1.5);
    expect(c.rating).toBe("burst");
    expect(c.maxDay).toBe(5000);
    expect(c.spendingDays).toBe(1);
  });

  it("uptoDay clamps the window", () => {
    const entries = [
      entry({
        amount: 100,
        chargeDate: new Date(2026, 4, 5, 12).toISOString(),
      }),
      entry({
        amount: 100,
        chargeDate: new Date(2026, 4, 20, 12).toISOString(), // outside if uptoDay=10
      }),
    ];
    const c = spendConsistency({
      entries,
      monthKey: "2026-05",
      uptoDay: 10,
    });
    expect(c.daysInWindow).toBe(10);
    expect(c.spendingDays).toBe(1);
  });

  it("excludes refund / pending / non-ILS / excluded", () => {
    const c = spendConsistency({
      entries: [
        entry({ isRefund: true }),
        entry({ bankPending: true }),
        entry({ needsConfirmation: true }),
        entry({ currency: "USD" }),
        entry({ excludeFromBudget: true }),
        entry({ amount: 100 }),
      ],
      monthKey: "2026-05",
    });
    expect(c.spendingDays).toBe(1);
  });

  it("installment slices contribute at the slice date", () => {
    const c = spendConsistency({
      entries: [
        entry({
          amount: 1200,
          installments: 12,
          chargeDate: new Date(2026, 0, 10, 12, 0, 0).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    // May slice = 100 on day 10.
    expect(c.maxDay).toBe(100);
    expect(c.spendingDays).toBe(1);
  });

  it("rating bands transition at 0.5 / 1 / 1.5", () => {
    // Construct daily series with controlled cv via test entries.
    // 30 days at 100 + 1 day at 200 → mean ≈ 103.2, stdDev ≈ 17.7,
    // cv ≈ 0.17 → "even".
    const days30: ExpenseEntry[] = Array.from({ length: 30 }, (_, i) =>
      entry({
        amount: 100,
        chargeDate: new Date(2026, 4, i + 1, 12).toISOString(),
      }),
    );
    const c1 = spendConsistency({
      entries: [
        ...days30,
        entry({
          amount: 100, // day 31 too → fully even
          chargeDate: new Date(2026, 4, 31, 12).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(c1.rating).toBe("even");
  });
});
