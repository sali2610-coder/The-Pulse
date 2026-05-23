import { describe, expect, it } from "vitest";

import { quietStreakReport } from "@/lib/quiet-streak";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date(2026, 4, 15, 14, 0, 0); // May 15 2026 14:00

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: daysAgo(0),
    createdAt: daysAgo(0),
    ...o,
  };
}

describe("quietStreakReport", () => {
  it("empty entries → currentStreak = windowDays", () => {
    const r = quietStreakReport({
      entries: [],
      now: NOW,
      windowDays: 10,
    });
    expect(r.currentStreak).toBe(10);
    expect(r.longestStreak).toBe(10);
    expect(r.quietDays).toBe(10);
  });

  it("charge today resets currentStreak to 0", () => {
    const r = quietStreakReport({
      entries: [entry({ chargeDate: daysAgo(0) })],
      now: NOW,
      windowDays: 10,
    });
    expect(r.currentStreak).toBe(0);
  });

  it("charge 4 days ago + nothing since → currentStreak = 4", () => {
    const r = quietStreakReport({
      entries: [entry({ chargeDate: daysAgo(4) })],
      now: NOW,
      windowDays: 10,
    });
    expect(r.currentStreak).toBe(4);
  });

  it("longestStreak = longest gap anywhere in the window", () => {
    const r = quietStreakReport({
      entries: [
        entry({ chargeDate: daysAgo(20) }),
        entry({ chargeDate: daysAgo(5) }),
        // 14 quiet days between day-20 and day-5
      ],
      now: NOW,
      windowDays: 30,
    });
    expect(r.longestStreak).toBe(14);
  });

  it("excludes refund / pending / needsConfirmation / non-ILS / excluded", () => {
    const r = quietStreakReport({
      entries: [
        entry({ chargeDate: daysAgo(0), isRefund: true }),
        entry({ chargeDate: daysAgo(0), bankPending: true }),
        entry({ chargeDate: daysAgo(0), needsConfirmation: true }),
        entry({ chargeDate: daysAgo(0), currency: "USD" }),
        entry({ chargeDate: daysAgo(0), excludeFromBudget: true }),
        entry({ chargeDate: daysAgo(0), amount: 0 }),
      ],
      now: NOW,
      windowDays: 10,
    });
    expect(r.currentStreak).toBe(10);
  });

  it("ignores entries outside the window", () => {
    const r = quietStreakReport({
      entries: [entry({ chargeDate: daysAgo(100) })],
      now: NOW,
      windowDays: 10,
    });
    expect(r.currentStreak).toBe(10);
    expect(r.quietDays).toBe(10);
  });

  it("currentStreak counts multiple consecutive quiet days", () => {
    const r = quietStreakReport({
      entries: [entry({ chargeDate: daysAgo(7) })],
      now: NOW,
      windowDays: 14,
    });
    expect(r.currentStreak).toBe(7);
  });
});
