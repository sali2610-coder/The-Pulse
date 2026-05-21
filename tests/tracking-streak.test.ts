import { describe, expect, it } from "vitest";

import { computeTrackingStreak } from "@/lib/tracking-streak";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date(2026, 4, 20, 12, 0);

function entry(createdAt: Date, overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${createdAt.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: createdAt.toISOString(),
    createdAt: createdAt.toISOString(),
    ...overrides,
  };
}

describe("computeTrackingStreak", () => {
  it("returns zero streak when there are no entries", () => {
    const s = computeTrackingStreak({ entries: [], now: NOW });
    expect(s.currentDays).toBe(0);
    expect(s.longestDays).toBe(0);
    expect(s.lastTrackedDate).toBeNull();
  });

  it("counts consecutive trailing days back from now", () => {
    const entries = [
      entry(new Date(2026, 4, 20, 9, 0)),
      entry(new Date(2026, 4, 19, 10, 0)),
      entry(new Date(2026, 4, 18, 11, 0)),
    ];
    const s = computeTrackingStreak({ entries, now: NOW });
    expect(s.currentDays).toBe(3);
    expect(s.lastTrackedDate).toBe("2026-05-20");
  });

  it("breaks current streak on a gap and tracks longest separately", () => {
    const entries = [
      entry(new Date(2026, 4, 20, 9, 0)),
      // Gap: no entry on the 19th.
      entry(new Date(2026, 4, 18, 9, 0)),
      entry(new Date(2026, 4, 17, 9, 0)),
      entry(new Date(2026, 4, 16, 9, 0)),
      entry(new Date(2026, 4, 15, 9, 0)),
    ];
    const s = computeTrackingStreak({ entries, now: NOW });
    expect(s.currentDays).toBe(1);
    expect(s.longestDays).toBe(4);
  });

  it("returns zero current when today has no entry", () => {
    const entries = [entry(new Date(2026, 4, 19, 9, 0))];
    const s = computeTrackingStreak({ entries, now: NOW });
    expect(s.currentDays).toBe(0);
    expect(s.longestDays).toBe(1);
    expect(s.lastTrackedDate).toBe("2026-05-19");
  });

  it("ignores invalid createdAt values", () => {
    const broken: ExpenseEntry = {
      id: "broken",
      amount: 0,
      category: "food",
      source: "manual",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: "not-a-date",
      createdAt: "not-a-date",
    };
    const s = computeTrackingStreak({
      entries: [broken, entry(new Date(2026, 4, 20))],
      now: NOW,
    });
    expect(s.currentDays).toBe(1);
  });
});
