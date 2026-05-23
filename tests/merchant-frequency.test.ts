import { describe, expect, it } from "vitest";

import { merchantFrequency } from "@/lib/merchant-frequency";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function entry(
  merchant: string,
  amount: number,
  monthIdx0: number,
  day: number,
  opts: Partial<ExpenseEntry> = {},
): ExpenseEntry {
  const date = new Date(2026, monthIdx0, day).toISOString();
  return {
    id: `e-${monthIdx0}-${day}-${amount}-${merchant}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    merchant,
    createdAt: date,
    ...opts,
  };
}

describe("merchantFrequency", () => {
  it("returns empty on empty entries", () => {
    const r = merchantFrequency({ entries: [], now: NOW });
    expect(r).toEqual([]);
  });

  it("groups variants of the same merchant", () => {
    const r = merchantFrequency({
      entries: [
        entry("שופרסל סניף 12", 200, 4, 5),
        entry("שופרסל", 150, 4, 10),
      ],
      now: NOW,
    });
    expect(r).toHaveLength(1);
    expect(r[0].visits).toBe(2);
    expect(r[0].monthlyTotal).toBe(350);
    expect(r[0].averageTicket).toBe(175);
  });

  it("computes prior-month delta", () => {
    const r = merchantFrequency({
      entries: [
        entry("Cafe", 100, 3, 5),
        entry("Cafe", 200, 4, 5),
      ],
      now: NOW,
    });
    const cafe = r.find((m) => m.label.toLowerCase().startsWith("cafe"));
    expect(cafe?.deltaPct).toBe(1);
  });

  it("reports Infinity delta for brand-new merchant", () => {
    const r = merchantFrequency({
      entries: [entry("New Bar", 100, 4, 5)],
      now: NOW,
    });
    expect(r[0].deltaPct).toBe(Number.POSITIVE_INFINITY);
  });

  it("excludes refunds and pending", () => {
    const r = merchantFrequency({
      entries: [
        entry("Shop", 200, 4, 5, { isRefund: true }),
        entry("Shop", 200, 4, 6, { needsConfirmation: true }),
      ],
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it("sorts by monthlyTotal descending", () => {
    const r = merchantFrequency({
      entries: [
        entry("Small", 50, 4, 5),
        entry("Big", 800, 4, 6),
        entry("Mid", 300, 4, 7),
      ],
      now: NOW,
    });
    expect(r.map((m) => m.label.toLowerCase())).toEqual(["big", "mid", "small"]);
  });
});
