import { describe, expect, it } from "vitest";

import { spendingHours } from "@/lib/spending-hours";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function entry(
  amount: number,
  iso: string,
  opts: Partial<ExpenseEntry> = {},
): ExpenseEntry {
  return {
    id: `e-${iso}-${amount}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    createdAt: iso,
    ...opts,
  };
}

describe("spendingHours", () => {
  it("hasEnoughData=false when fewer than 10 qualifying entries", () => {
    const r = spendingHours({ entries: [entry(50, "2026-05-10T10:00:00Z")], now: NOW });
    expect(r.hasEnoughData).toBe(false);
  });

  it("aggregates 4 hour buckets correctly", () => {
    // 12 evening entries at 19:00 local
    const evenings = Array.from({ length: 12 }, (_, i) =>
      entry(100, new Date(2026, 4, 1 + i, 19, 0, 0).toISOString()),
    );
    const r = spendingHours({ entries: evenings, now: NOW });
    const evening = r.buckets.find((b) => b.bucket === "evening");
    expect(evening?.count).toBe(12);
    expect(r.mostActiveBucket).toBe("evening");
    expect(r.highestSpendBucket).toBe("evening");
    expect(r.hasEnoughData).toBe(true);
  });

  it("classifies 23:00 and 02:00 as night", () => {
    const nights = Array.from({ length: 10 }, (_, i) =>
      entry(50, new Date(2026, 4, 1 + i, i % 2 === 0 ? 23 : 2, 0, 0).toISOString()),
    );
    const r = spendingHours({ entries: nights, now: NOW });
    expect(r.mostActiveBucket).toBe("night");
  });

  it("computes weekday vs weekend split (Israeli weekend Fri+Sat)", () => {
    // Sundays in May 2026 (Sun = weekday): 3, 10, 17, 24, 31
    const sundays = [3, 10, 17, 24, 31].map(
      (d) => entry(100, new Date(2026, 4, d, 12, 0, 0).toISOString()),
    );
    // Fridays in May 2026 (Fri = weekend): 1, 8, 15, 22, 29
    const fridays = [1, 8, 15, 22, 29].map(
      (d) => entry(100, new Date(2026, 4, d, 12, 0, 0).toISOString()),
    );
    const r = spendingHours({
      entries: [...sundays, ...fridays],
      now: new Date("2026-06-15T08:00:00.000Z"),
    });
    expect(r.split.weekday.count).toBe(5);
    expect(r.split.weekend.count).toBe(5);
    expect(r.split.weekday.share).toBeCloseTo(0.5, 2);
  });

  it("skips entries older than the lookback window", () => {
    const ancient = entry(50, "2025-01-01T12:00:00.000Z");
    const r = spendingHours({ entries: [ancient], now: NOW });
    expect(r.totalEntries).toBe(0);
  });

  it("skips refunds / pending / FX rows", () => {
    const noisy: ExpenseEntry[] = [
      entry(50, "2026-05-10T10:00:00Z", { isRefund: true }),
      entry(50, "2026-05-10T10:00:00Z", { needsConfirmation: true }),
      entry(50, "2026-05-10T10:00:00Z", { bankPending: true }),
      entry(50, "2026-05-10T10:00:00Z", { currency: "USD" }),
    ];
    const r = spendingHours({ entries: noisy, now: NOW });
    expect(r.totalEntries).toBe(0);
  });
});
