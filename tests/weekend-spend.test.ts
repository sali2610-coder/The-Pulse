import { describe, expect, it } from "vitest";

import { weekendSpendReport } from "@/lib/weekend-spend";
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

describe("weekendSpendReport", () => {
  it("empty → zero everything", () => {
    const r = weekendSpendReport({
      entries: [],
      monthKey: "2026-05",
    });
    expect(r.current.total).toBe(0);
    expect(r.current.weekendShare).toBe(0);
    expect(r.shareDelta).toBe(0);
  });

  it("partitions by day-of-week (Fri/Sat = weekend)", () => {
    // May 2026: 1=Fri, 2=Sat, 3=Sun, 8=Fri, 9=Sat, 11=Mon.
    const r = weekendSpendReport({
      entries: [
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 1, 12, 0, 0).toISOString(),
        }), // Fri
        entry({
          amount: 200,
          chargeDate: new Date(2026, 4, 2, 12, 0, 0).toISOString(),
        }), // Sat
        entry({
          amount: 50,
          chargeDate: new Date(2026, 4, 4, 12, 0, 0).toISOString(),
        }), // Mon
        entry({
          amount: 150,
          chargeDate: new Date(2026, 4, 11, 12, 0, 0).toISOString(),
        }), // Mon
      ],
      monthKey: "2026-05",
    });
    expect(r.current.weekendTotal).toBe(300);
    expect(r.current.weekdayTotal).toBe(200);
    expect(r.current.weekendShare).toBeCloseTo(300 / 500, 5);
  });

  it("ignores refund / pending / non-ILS / excluded", () => {
    const r = weekendSpendReport({
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
    expect(r.current.total).toBe(100);
  });

  it("returns N prior months (oldest first)", () => {
    const r = weekendSpendReport({
      entries: [],
      monthKey: "2026-05",
      lookback: 3,
    });
    expect(r.prior.map((p) => p.monthKey)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("shareDelta = current − average of NON-EMPTY prior months", () => {
    const r = weekendSpendReport({
      entries: [
        // Current month (May): weekend 100, weekday 100 → 0.5 share
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 1, 12).toISOString(),
        }),
        entry({
          amount: 100,
          chargeDate: new Date(2026, 4, 4, 12).toISOString(),
        }),
        // Prior April: all weekend (100% share)
        entry({
          amount: 100,
          chargeDate: new Date(2026, 3, 3, 12).toISOString(),
        }), // Fri
        entry({
          amount: 100,
          chargeDate: new Date(2026, 3, 4, 12).toISOString(),
        }), // Sat
      ],
      monthKey: "2026-05",
      lookback: 1,
    });
    // current share 0.5, prior April share 1.0 → delta -0.5
    expect(r.current.weekendShare).toBeCloseTo(0.5, 5);
    expect(r.shareDelta).toBeCloseTo(-0.5, 5);
  });

  it("uses slice amount for installments", () => {
    const r = weekendSpendReport({
      entries: [
        entry({
          amount: 1200,
          installments: 12,
          chargeDate: new Date(2026, 0, 2, 12, 0, 0).toISOString(), // Friday Jan 2
        }),
      ],
      monthKey: "2026-05",
    });
    // May 2026 slice falls on the 2nd → which is Sat.
    const slice = r.current.weekendTotal + r.current.weekdayTotal;
    expect(slice).toBe(100);
  });
});
