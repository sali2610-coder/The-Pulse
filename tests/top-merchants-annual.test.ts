import { describe, expect, it } from "vitest";

import { topMerchantsAnnual } from "@/lib/top-merchants";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date(2026, 4, 15, 12, 0, 0);

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: daysAgo(10),
    createdAt: daysAgo(10),
    merchant: "ארומה",
    ...o,
  };
}

describe("topMerchantsAnnual", () => {
  it("empty → empty", () => {
    expect(topMerchantsAnnual({ entries: [], end: NOW })).toEqual([]);
  });

  it("groups same merchant key (canonicalised variants)", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ merchant: "שופרסל סניף 12", amount: 100 }),
        entry({ merchant: "שופרסל", amount: 250 }),
        entry({ merchant: "שופרסל סניף 7", amount: 90 }),
      ],
      end: NOW,
    });
    expect(stats).toHaveLength(1);
    expect(stats[0].outflowTotal).toBe(440);
    expect(stats[0].chargeCount).toBe(3);
  });

  it("netTotal = outflowTotal − refundTotal", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ amount: 500 }),
        entry({ amount: 80, isRefund: true }),
      ],
      end: NOW,
    });
    expect(stats[0].outflowTotal).toBe(500);
    expect(stats[0].refundTotal).toBe(80);
    expect(stats[0].netTotal).toBe(420);
  });

  it("respects the rolling window", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ amount: 100, chargeDate: daysAgo(30) }),
        entry({ amount: 200, chargeDate: daysAgo(400) }), // outside
      ],
      end: NOW,
    });
    expect(stats[0].outflowTotal).toBe(100);
  });

  it("excludes needsConfirmation / pending / non-ILS", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ amount: 100, needsConfirmation: true }),
        entry({ amount: 100, bankPending: true }),
        entry({ amount: 100, currency: "USD" }),
        entry({ amount: 100 }),
      ],
      end: NOW,
    });
    expect(stats[0].outflowTotal).toBe(100);
    expect(stats[0].chargeCount).toBe(1);
  });

  it("sorts by netTotal DESC and limits", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ merchant: "Small", amount: 50 }),
        entry({ merchant: "Big", amount: 5000 }),
        entry({ merchant: "Mid", amount: 1000 }),
      ],
      end: NOW,
      limit: 2,
    });
    expect(stats.map((s) => s.label)).toEqual(["Big", "Mid"]);
  });

  it("picks the most common variant as label", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ merchant: "שופרסל סניף 12", amount: 100 }),
        entry({ merchant: "שופרסל", amount: 100 }),
        entry({ merchant: "שופרסל", amount: 100 }),
      ],
      end: NOW,
    });
    // sanitizeMerchant canonicalises to "שופרסל" regardless of branch,
    // so the most-common label IS "שופרסל".
    expect(stats[0].label).toBe("שופרסל");
  });

  it("monthsActive counts distinct months", () => {
    const stats = topMerchantsAnnual({
      entries: [
        entry({ chargeDate: daysAgo(5) }),
        entry({ chargeDate: daysAgo(40) }),
        entry({ chargeDate: daysAgo(100) }),
      ],
      end: NOW,
    });
    expect(stats[0].monthsActive).toBe(3);
  });
});
