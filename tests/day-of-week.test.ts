import { describe, expect, it } from "vitest";
import { dayOfWeekSpend } from "@/lib/forecast";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    ...overrides,
  };
}

describe("dayOfWeekSpend", () => {
  it("buckets charges by JS day-of-week (Sun=0..Sat=6)", () => {
    // May 1 2026 is a Friday (5). May 3 is Sunday (0). May 6 is Wednesday (3).
    const entries: ExpenseEntry[] = [
      entry({ amount: 50, chargeDate: new Date(2026, 4, 1).toISOString() }),
      entry({ amount: 30, chargeDate: new Date(2026, 4, 3).toISOString() }),
      entry({ amount: 80, chargeDate: new Date(2026, 4, 6).toISOString() }),
    ];
    const out = dayOfWeekSpend({ entries, monthKey: "2026-05", monthsBack: 1 });
    expect(out.length).toBe(7);
    expect(out[0].total).toBe(30); // Sun
    expect(out[3].total).toBe(80); // Wed
    expect(out[5].total).toBe(50); // Fri
    expect(out[1].total).toBe(0);
  });

  it("accumulates over the lookback window", () => {
    const entries: ExpenseEntry[] = [
      // Apr 3 (Friday) and May 1 (Friday) — both should land in Fri bucket.
      entry({ amount: 100, chargeDate: new Date(2026, 3, 3).toISOString() }),
      entry({ amount: 200, chargeDate: new Date(2026, 4, 1).toISOString() }),
    ];
    const out = dayOfWeekSpend({ entries, monthKey: "2026-05", monthsBack: 2 });
    expect(out[5].total).toBe(300);
    expect(out[5].count).toBe(2);
  });

  it("skips refunds / FX / pending / needsConfirmation", () => {
    const entries: ExpenseEntry[] = [
      entry({ amount: 100, isRefund: true }),
      entry({ amount: 200, currency: "USD" }),
      entry({ amount: 300, bankPending: true }),
      entry({ amount: 400, needsConfirmation: true }),
      entry({ amount: 50 }),
    ];
    const out = dayOfWeekSpend({ entries, monthKey: "2026-05", monthsBack: 1 });
    const sum = out.reduce((a, p) => a + p.total, 0);
    expect(sum).toBe(50);
  });
});
