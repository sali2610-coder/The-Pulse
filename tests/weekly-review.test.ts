import { describe, expect, it } from "vitest";

import { weeklyReview } from "@/lib/weekly-review";
import type { ExpenseEntry } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    ...o,
  };
}

const NOW = new Date(2026, 4, 15, 12, 0, 0); // May 15

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("weeklyReview", () => {
  it("empty entries → zero everything", () => {
    const r = weeklyReview({ entries: [], now: NOW });
    expect(r.spentThisWeek).toBe(0);
    expect(r.spentPriorWeek).toBe(0);
    expect(r.delta).toBe(0);
    expect(r.topMovers).toEqual([]);
    expect(r.biggestCharge).toBeNull();
    expect(r.chargesThisWeek).toBe(0);
  });

  it("splits current vs prior week buckets", () => {
    const r = weeklyReview({
      entries: [
        entry({ chargeDate: daysAgo(2), amount: 100 }),   // this week
        entry({ chargeDate: daysAgo(5), amount: 200 }),   // this week
        entry({ chargeDate: daysAgo(9), amount: 50 }),    // prior week
        entry({ chargeDate: daysAgo(13), amount: 80 }),   // prior week
      ],
      now: NOW,
    });
    expect(r.spentThisWeek).toBe(300);
    expect(r.spentPriorWeek).toBe(130);
    expect(r.delta).toBe(170);
    expect(r.chargesThisWeek).toBe(2);
  });

  it("excludes refunds, pending, needsConfirmation, excludeFromBudget", () => {
    const r = weeklyReview({
      entries: [
        entry({ chargeDate: daysAgo(2), amount: 100, isRefund: true }),
        entry({ chargeDate: daysAgo(2), amount: 100, bankPending: true }),
        entry({ chargeDate: daysAgo(2), amount: 100, needsConfirmation: true }),
        entry({ chargeDate: daysAgo(2), amount: 100, excludeFromBudget: true }),
        entry({ chargeDate: daysAgo(2), amount: 100 }), // only one counted
      ],
      now: NOW,
    });
    expect(r.spentThisWeek).toBe(100);
    expect(r.chargesThisWeek).toBe(1);
  });

  it("excludes non-ILS currency entries", () => {
    const r = weeklyReview({
      entries: [
        entry({ chargeDate: daysAgo(2), amount: 50, currency: "USD" }),
        entry({ chargeDate: daysAgo(2), amount: 75 }),
      ],
      now: NOW,
    });
    expect(r.spentThisWeek).toBe(75);
  });

  it("biggestCharge picks the largest in the current window", () => {
    const r = weeklyReview({
      entries: [
        entry({
          chargeDate: daysAgo(2),
          amount: 100,
          merchant: "ארומה",
          category: "food",
        }),
        entry({
          chargeDate: daysAgo(3),
          amount: 500,
          merchant: "איקאה",
          category: "shopping",
        }),
        entry({
          chargeDate: daysAgo(10),
          amount: 999,
          merchant: "Apple",
          category: "entertainment",
        }),
      ],
      now: NOW,
    });
    expect(r.biggestCharge?.amount).toBe(500);
    expect(r.biggestCharge?.merchant).toBe("איקאה");
  });

  it("topMovers sorts by |delta| DESC and excludes zero-delta categories", () => {
    const r = weeklyReview({
      entries: [
        entry({ chargeDate: daysAgo(2), amount: 300, category: "food" }),
        entry({ chargeDate: daysAgo(10), amount: 100, category: "food" }),
        entry({ chargeDate: daysAgo(3), amount: 50, category: "transport" }),
        entry({ chargeDate: daysAgo(10), amount: 50, category: "transport" }),
        entry({ chargeDate: daysAgo(2), amount: 80, category: "shopping" }),
      ],
      now: NOW,
    });
    expect(r.topMovers[0].category).toBe("food"); // delta 200
    expect(r.topMovers[0].delta).toBe(200);
    expect(r.topMovers[1].category).toBe("shopping"); // delta 80
    // transport delta is 0 → excluded
    expect(r.topMovers.find((m) => m.category === "transport")).toBeUndefined();
  });

  it("deltaPct = Infinity when priorWeek is zero", () => {
    const r = weeklyReview({
      entries: [entry({ chargeDate: daysAgo(2), amount: 100 })],
      now: NOW,
    });
    expect(r.deltaPct).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts only the slice that falls in the window for installments", () => {
    // 6-month installment plan starting 4 months ago at 600 total / 6 = 100/m.
    // The slice landing THIS month falls inside the current week if
    // chargeDate is within 7 days of NOW.
    const r = weeklyReview({
      entries: [
        entry({
          chargeDate: new Date(2026, 0, 13, 12, 0, 0).toISOString(),
          amount: 600,
          installments: 6,
        }),
      ],
      now: NOW,
    });
    // May slice charge date 13/5 — 2 days before NOW (15/5) → inside this week.
    expect(r.spentThisWeek).toBe(100);
    expect(r.chargesThisWeek).toBe(1);
  });
});
