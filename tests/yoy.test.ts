import { describe, expect, it } from "vitest";

import { yoyReport } from "@/lib/yoy";
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

describe("yoyReport", () => {
  it("priorMonth is 12 months before thisMonth", () => {
    const r = yoyReport({
      entries: [],
      monthKey: "2026-05",
    });
    expect(r.thisMonth).toBe("2026-05");
    expect(r.priorMonth).toBe("2025-05");
  });

  it("empty entries → all zeros", () => {
    const r = yoyReport({
      entries: [],
      monthKey: "2026-05",
    });
    expect(r.thisYearTotal).toBe(0);
    expect(r.lastYearTotal).toBe(0);
    expect(r.delta).toBe(0);
    expect(r.topMovers).toEqual([]);
  });

  it("compares same month across years", () => {
    const r = yoyReport({
      entries: [
        entry({
          amount: 200,
          chargeDate: new Date(2026, 4, 10).toISOString(),
        }),
        entry({
          amount: 100,
          chargeDate: new Date(2025, 4, 10).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(r.thisYearTotal).toBe(200);
    expect(r.lastYearTotal).toBe(100);
    expect(r.delta).toBe(100);
    expect(r.deltaPct).toBe(100);
  });

  it("deltaPct = Infinity when lastYear is 0", () => {
    const r = yoyReport({
      entries: [
        entry({
          amount: 200,
          chargeDate: new Date(2026, 4, 10).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(r.deltaPct).toBe(Number.POSITIVE_INFINITY);
  });

  it("topMovers sorted by |delta| DESC, zero-delta excluded", () => {
    const r = yoyReport({
      entries: [
        // food: 500 vs 100 → +400
        entry({
          amount: 500,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          category: "food",
        }),
        entry({
          amount: 100,
          chargeDate: new Date(2025, 4, 10).toISOString(),
          category: "food",
        }),
        // shopping: 100 vs 1000 → -900
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          category: "shopping",
        }),
        entry({
          amount: 1000,
          chargeDate: new Date(2025, 4, 10).toISOString(),
          category: "shopping",
        }),
        // transport: 50 vs 50 → 0 (excluded)
        entry({
          amount: 50,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          category: "transport",
        }),
        entry({
          amount: 50,
          chargeDate: new Date(2025, 4, 10).toISOString(),
          category: "transport",
        }),
      ],
      monthKey: "2026-05",
    });
    expect(r.topMovers.map((m) => m.category)).toEqual(["shopping", "food"]);
    expect(r.topMovers.find((m) => m.category === "transport")).toBeUndefined();
  });

  it("excludes noisy entries", () => {
    const r = yoyReport({
      entries: [
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          isRefund: true,
        }),
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          currency: "USD",
        }),
        entry({
          amount: 200,
          chargeDate: new Date(2026, 4, 10).toISOString(),
        }),
      ],
      monthKey: "2026-05",
    });
    expect(r.thisYearTotal).toBe(200);
  });

  it("crosses year boundary correctly (Jan → prior Jan)", () => {
    const r = yoyReport({
      entries: [],
      monthKey: "2026-01",
    });
    expect(r.priorMonth).toBe("2025-01");
  });
});
