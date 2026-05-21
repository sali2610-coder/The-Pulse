import { describe, expect, it } from "vitest";

import { summarizeForeignCurrency } from "@/lib/fx-summary";
import type { ExpenseEntry, MonthKey } from "@/types/finance";

const MAY: MonthKey = "2026-05";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    ...overrides,
  };
}

describe("summarizeForeignCurrency", () => {
  it("returns empty when no FX entries", () => {
    const out = summarizeForeignCurrency({
      entries: [entry()],
      monthKey: MAY,
    });
    expect(out.buckets).toHaveLength(0);
    expect(out.totalEntries).toBe(0);
  });

  it("groups by currency and sorts by total desc", () => {
    const entries = [
      entry({ currency: "USD", amount: 50 }),
      entry({ currency: "USD", amount: 30 }),
      entry({ currency: "EUR", amount: 200 }),
    ];
    const out = summarizeForeignCurrency({ entries, monthKey: MAY });
    expect(out.buckets[0].currency).toBe("EUR");
    expect(out.buckets[0].total).toBe(200);
    expect(out.buckets[1].currency).toBe("USD");
    expect(out.buckets[1].total).toBe(80);
    expect(out.buckets[1].count).toBe(2);
    expect(out.totalEntries).toBe(3);
  });

  it("skips refunds + pending + needsConfirmation", () => {
    const entries = [
      entry({ currency: "USD", isRefund: true, amount: 100 }),
      entry({ currency: "USD", bankPending: true, amount: 100 }),
      entry({
        currency: "USD",
        needsConfirmation: true,
        amount: 100,
      }),
      entry({ currency: "USD", amount: 75 }),
    ];
    const out = summarizeForeignCurrency({ entries, monthKey: MAY });
    expect(out.buckets).toHaveLength(1);
    expect(out.buckets[0].total).toBe(75);
  });

  it("ignores ILS entries", () => {
    const entries = [
      entry({ currency: "ILS", amount: 500 }),
      entry({ amount: 700 }),
    ];
    expect(
      summarizeForeignCurrency({ entries, monthKey: MAY }).buckets,
    ).toHaveLength(0);
  });
});
