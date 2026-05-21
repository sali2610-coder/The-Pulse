import { describe, expect, it } from "vitest";

import { monthDelta } from "@/lib/month-delta";
import type { ExpenseEntry, MonthKey } from "@/types/finance";

const MAY: MonthKey = "2026-05";

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

describe("monthDelta", () => {
  it("returns zero totals when there is no data", () => {
    const md = monthDelta({ entries: [], monthKey: MAY });
    expect(md.thisMonthTotal).toBe(0);
    expect(md.priorMonthTotal).toBe(0);
    expect(md.delta).toBe(0);
    expect(md.deltaPct).toBeNull();
    expect(md.topGrew).toHaveLength(0);
    expect(md.topShrunk).toHaveLength(0);
  });

  it("computes month-over-month delta and pct", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 1000,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 1300,
      }),
    ];
    const md = monthDelta({ entries, monthKey: MAY });
    expect(md.priorMonthTotal).toBe(1000);
    expect(md.thisMonthTotal).toBe(1300);
    expect(md.delta).toBe(300);
    expect(md.deltaPct).toBe(30);
  });

  it("excludes refunds + excludeFromBudget + pending + needsConfirmation", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 100,
        isRefund: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 100,
        excludeFromBudget: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 100,
        bankPending: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 100,
        needsConfirmation: true,
      }),
      entry({
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 250,
      }),
    ];
    const md = monthDelta({ entries, monthKey: MAY });
    expect(md.thisMonthTotal).toBe(250);
  });

  it("ranks topGrew by absolute delta desc", () => {
    const entries = [
      // food: 300 → 800 (+500)
      entry({
        category: "food",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 300,
      }),
      entry({
        category: "food",
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 800,
      }),
      // transport: 200 → 500 (+300)
      entry({
        category: "transport",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 200,
      }),
      entry({
        category: "transport",
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 500,
      }),
      // entertainment: 800 → 200 (-600) — shrunk
      entry({
        category: "entertainment",
        chargeDate: new Date(2026, 3, 5).toISOString(),
        amount: 800,
      }),
      entry({
        category: "entertainment",
        chargeDate: new Date(2026, 4, 5).toISOString(),
        amount: 200,
      }),
    ];
    const md = monthDelta({ entries, monthKey: MAY });
    expect(md.topGrew.map((r) => r.category)).toEqual([
      "food",
      "transport",
    ]);
    expect(md.topShrunk[0].category).toBe("entertainment");
    expect(md.topShrunk[0].delta).toBe(-600);
  });

  it("respects topCount cap", () => {
    const entries: ExpenseEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(
        entry({
          category: ["food", "transport", "entertainment", "bills", "other"][
            i
          ] as ExpenseEntry["category"],
          chargeDate: new Date(2026, 4, 5).toISOString(),
          amount: 100 + i * 50,
        }),
      );
    }
    const md = monthDelta({
      entries,
      monthKey: MAY,
      topCount: 2,
    });
    expect(md.topGrew.length).toBeLessThanOrEqual(2);
  });
});
