import { describe, expect, it } from "vitest";
import { paymentMethodMonthlyTotals } from "@/lib/forecast";
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

describe("paymentMethodMonthlyTotals", () => {
  it("splits totals by payment method per month, oldest → newest", () => {
    const entries: ExpenseEntry[] = [
      entry({ amount: 200, paymentMethod: "credit", chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ amount: 100, paymentMethod: "cash", chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ amount: 400, paymentMethod: "credit", chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const out = paymentMethodMonthlyTotals({
      entries,
      monthKey: "2026-05",
      monthsBack: 2,
    });
    expect(out.length).toBe(2);
    expect(out[0].monthKey).toBe("2026-04");
    expect(out[0].cash).toBe(100);
    expect(out[0].credit).toBe(200);
    expect(out[1].monthKey).toBe("2026-05");
    expect(out[1].cash).toBe(0);
    expect(out[1].credit).toBe(400);
  });

  it("skips needsConfirmation / pending / refund / FX", () => {
    const entries: ExpenseEntry[] = [
      entry({ amount: 100, needsConfirmation: true }),
      entry({ amount: 200, bankPending: true }),
      entry({ amount: 300, isRefund: true }),
      entry({ amount: 400, currency: "USD" }),
      entry({ amount: 50, paymentMethod: "cash" }),
    ];
    const out = paymentMethodMonthlyTotals({
      entries,
      monthKey: "2026-05",
      monthsBack: 1,
    });
    expect(out[0].cash).toBe(50);
    expect(out[0].credit).toBe(0);
  });

  it("treats installment entries as their per-month slice", () => {
    const entries: ExpenseEntry[] = [
      entry({
        amount: 1200,
        installments: 12,
        chargeDate: new Date(2026, 0, 5).toISOString(),
      }),
    ];
    const out = paymentMethodMonthlyTotals({
      entries,
      monthKey: "2026-05",
      monthsBack: 6,
    });
    // Each of the 6 months (Dec..May) has a 100 slice except December which
    // was before chargeDate Jan 5 — so Jan..May = 5 months × 100 = 500.
    expect(out[0].credit).toBe(0); // Dec
    expect(out[1].credit).toBe(100); // Jan
    expect(out[5].credit).toBe(100); // May
  });
});
