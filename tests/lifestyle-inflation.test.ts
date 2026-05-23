import { describe, expect, it } from "vitest";

import { lifestyleInflationReport } from "@/lib/lifestyle-inflation";
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

describe("lifestyleInflationReport", () => {
  it("windows are 3 months each, prior is 12 months back", () => {
    const r = lifestyleInflationReport({
      entries: [],
      endMonth: "2026-05",
    });
    expect(r.recentWindow).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(r.priorWindow).toEqual(["2025-03", "2025-04", "2025-05"]);
  });

  it("empty entries → both averages 0, deltaPct Infinity", () => {
    const r = lifestyleInflationReport({
      entries: [],
      endMonth: "2026-05",
    });
    expect(r.recentAvg).toBe(0);
    expect(r.priorAvg).toBe(0);
    expect(r.deltaPct).toBe(Number.POSITIVE_INFINITY);
    expect(r.trend).toBe("stable");
  });

  it("computes averages from the two 3-month windows", () => {
    const r = lifestyleInflationReport({
      entries: [
        // recent: 3000 + 3000 + 3000 = 9000 → avg 3000
        entry({ amount: 3000, chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ amount: 3000, chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ amount: 3000, chargeDate: new Date(2026, 4, 10).toISOString() }),
        // prior: 2000 + 2000 + 2000 = 6000 → avg 2000
        entry({ amount: 2000, chargeDate: new Date(2025, 2, 10).toISOString() }),
        entry({ amount: 2000, chargeDate: new Date(2025, 3, 10).toISOString() }),
        entry({ amount: 2000, chargeDate: new Date(2025, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
    });
    expect(r.recentAvg).toBe(3000);
    expect(r.priorAvg).toBe(2000);
    expect(r.delta).toBe(1000);
    expect(r.deltaPct).toBe(50);
    expect(r.trend).toBe("inflation"); // ≥15%
  });

  it("trend stable when |deltaPct| < 5", () => {
    const r = lifestyleInflationReport({
      entries: [
        entry({ amount: 1020, chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ amount: 1020, chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ amount: 1020, chargeDate: new Date(2026, 4, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 2, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 3, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
    });
    expect(r.trend).toBe("stable");
  });

  it("trend drift between 5% and 15%", () => {
    const r = lifestyleInflationReport({
      entries: [
        entry({ amount: 1100, chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ amount: 1100, chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ amount: 1100, chargeDate: new Date(2026, 4, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 2, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 3, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
    });
    expect(r.trend).toBe("drift");
  });

  it("trend deflation when ≤ -5%", () => {
    const r = lifestyleInflationReport({
      entries: [
        entry({ amount: 800, chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ amount: 800, chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ amount: 800, chargeDate: new Date(2026, 4, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 2, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 3, 10).toISOString() }),
        entry({ amount: 1000, chargeDate: new Date(2025, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
    });
    expect(r.trend).toBe("deflation");
  });

  it("ignores noisy entries", () => {
    const r = lifestyleInflationReport({
      entries: [
        entry({
          amount: 999,
          chargeDate: new Date(2026, 4, 10).toISOString(),
          isRefund: true,
        }),
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 10).toISOString(),
        }),
      ],
      endMonth: "2026-05",
    });
    // recent window has 100 in May → avg 100/3 = 33.33
    expect(r.recentAvg).toBeCloseTo(100 / 3, 5);
  });
});
