import { describe, expect, it } from "vitest";

import { avgTicketTrend } from "@/lib/avg-ticket";
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

describe("avgTicketTrend", () => {
  it("returns N months oldest first", () => {
    const r = avgTicketTrend({
      entries: [],
      endMonth: "2026-05",
      months: 3,
    });
    expect(r.points.map((p) => p.monthKey)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("empty → all points zero, trend 0", () => {
    const r = avgTicketTrend({
      entries: [],
      endMonth: "2026-05",
      months: 3,
    });
    expect(r.points.every((p) => p.avg === 0 && p.count === 0)).toBe(true);
    expect(r.trend).toBe(0);
  });

  it("computes per-month avg from ORIGINAL entry amount", () => {
    const r = avgTicketTrend({
      entries: [
        entry({ amount: 200, chargeDate: new Date(2026, 4, 5).toISOString() }),
        entry({ amount: 300, chargeDate: new Date(2026, 4, 6).toISOString() }),
      ],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].count).toBe(2);
    expect(r.points[0].total).toBe(500);
    expect(r.points[0].avg).toBe(250);
  });

  it("trend positive when last month > prior average", () => {
    const r = avgTicketTrend({
      entries: [
        entry({ amount: 100, chargeDate: new Date(2026, 3, 10).toISOString() }), // April avg 100
        entry({ amount: 300, chargeDate: new Date(2026, 4, 10).toISOString() }), // May avg 300
      ],
      endMonth: "2026-05",
      months: 2,
    });
    expect(r.trend).toBe(200);
  });

  it("trend negative when last month < prior average", () => {
    const r = avgTicketTrend({
      entries: [
        entry({ amount: 400, chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ amount: 100, chargeDate: new Date(2026, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
      months: 2,
    });
    expect(r.trend).toBe(-300);
  });

  it("noisy entries excluded", () => {
    const r = avgTicketTrend({
      entries: [
        entry({ amount: 999, isRefund: true }),
        entry({ amount: 999, bankPending: true }),
        entry({ amount: 999, needsConfirmation: true }),
        entry({ amount: 999, currency: "USD" }),
        entry({ amount: 999, excludeFromBudget: true }),
        entry({ amount: 100 }),
      ],
      endMonth: "2026-05",
      months: 1,
    });
    expect(r.points[0].total).toBe(100);
    expect(r.points[0].avg).toBe(100);
  });

  it("uses ORIGINAL amount (not slice) for installments", () => {
    // 1200 / 12 plan started in Jan. Original entry is in Jan;
    // slice schedule doesn't redistribute the avg ticket lens —
    // we want the user's "feel" of the original charge.
    const r = avgTicketTrend({
      entries: [
        entry({
          amount: 1200,
          installments: 12,
          chargeDate: new Date(2026, 0, 10).toISOString(),
        }),
      ],
      endMonth: "2026-05",
      months: 6,
    });
    const jan = r.points.find((p) => p.monthKey === "2026-01")!;
    expect(jan.avg).toBe(1200);
    expect(r.points.find((p) => p.monthKey === "2026-05")!.count).toBe(0);
  });

  it("ignores entries outside the window", () => {
    const r = avgTicketTrend({
      entries: [
        entry({ amount: 999, chargeDate: new Date(2025, 11, 10).toISOString() }),
        entry({ amount: 100, chargeDate: new Date(2026, 4, 10).toISOString() }),
      ],
      endMonth: "2026-05",
      months: 3,
    });
    expect(r.points.find((p) => p.monthKey === "2026-05")!.avg).toBe(100);
    expect(r.points.find((p) => p.monthKey === "2026-03")!.avg).toBe(0);
  });
});
