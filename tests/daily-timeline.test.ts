import { describe, expect, it } from "vitest";

import { buildDailyTimeline } from "@/lib/daily-timeline";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: `e-${iso}-${amount}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    createdAt: iso,
    ...rest,
  };
}

describe("buildDailyTimeline", () => {
  it("returns one row per day in the window, newest first", () => {
    const rows = buildDailyTimeline({
      entries: [],
      windowDays: 5,
      now: NOW,
    });
    expect(rows).toHaveLength(5);
    // newest first
    expect(rows[0].section).toBe("today");
    expect(rows.at(-1)!.timestamp).toBeLessThan(rows[0].timestamp);
  });

  it("flags today / yesterday / this_week / earlier sections", () => {
    const rows = buildDailyTimeline({
      entries: [],
      windowDays: 14,
      now: NOW,
    });
    const sections = new Set(rows.map((r) => r.section));
    expect(sections.has("today")).toBe(true);
    expect(sections.has("yesterday")).toBe(true);
    expect(sections.has("earlier")).toBe(true);
  });

  it("sums spend + inflow + net per day", () => {
    const rows = buildDailyTimeline({
      entries: [
        entry({ amount: 200, iso: "2026-05-15T09:00:00Z" }),
        entry({ amount: 50, iso: "2026-05-15T11:00:00Z", isRefund: true }),
        entry({ amount: 100, iso: "2026-05-14T10:00:00Z" }),
      ],
      windowDays: 7,
      now: NOW,
    });
    const today = rows.find((r) => r.section === "today")!;
    expect(today.spend).toBe(200);
    expect(today.inflow).toBe(50);
    expect(today.net).toBe(-150);
    expect(today.count).toBe(2);
    const yest = rows.find((r) => r.section === "yesterday")!;
    expect(yest.spend).toBe(100);
  });

  it("running balance accumulates oldest → newest, anchor included", () => {
    const rows = buildDailyTimeline({
      entries: [
        entry({ amount: 100, iso: "2026-05-13T10:00:00Z" }),
        entry({ amount: 200, iso: "2026-05-14T10:00:00Z" }),
        entry({ amount: 50, iso: "2026-05-15T10:00:00Z" }),
      ],
      windowDays: 4,
      anchorBalance: 1000,
      now: NOW,
    });
    // rows[0] is today. running balance at "today" = 1000 - 100 - 200 - 50 = 650.
    expect(rows[0].runningBalance).toBe(650);
    // earliest day in the window has nothing → running = 1000.
    expect(rows.at(-1)!.runningBalance).toBe(1000);
  });

  it("skips entries flagged needsConfirmation / pending / FX / excluded", () => {
    const rows = buildDailyTimeline({
      entries: [
        entry({ amount: 999, iso: "2026-05-15T10:00:00Z", needsConfirmation: true }),
        entry({ amount: 999, iso: "2026-05-15T10:00:00Z", bankPending: true }),
        entry({ amount: 999, iso: "2026-05-15T10:00:00Z", currency: "USD" }),
        entry({ amount: 999, iso: "2026-05-15T10:00:00Z", excludeFromBudget: true }),
      ],
      windowDays: 3,
      now: NOW,
    });
    const today = rows.find((r) => r.section === "today")!;
    expect(today.spend).toBe(0);
    expect(today.count).toBe(0);
  });

  it("Hebrew labels for today / yesterday", () => {
    const rows = buildDailyTimeline({ entries: [], windowDays: 3, now: NOW });
    expect(rows.find((r) => r.section === "today")?.label).toBe("היום");
    expect(rows.find((r) => r.section === "yesterday")?.label).toBe("אתמול");
  });
});
