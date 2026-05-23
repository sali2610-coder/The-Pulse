import { describe, expect, it } from "vitest";

import { dailyInsights } from "@/lib/daily-insights";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: `e-${iso}-${amount}-${opts.merchant ?? ""}`,
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

describe("dailyInsights", () => {
  it("returns empty when there is no data", () => {
    const r = dailyInsights({ entries: [], now: NOW });
    expect(r).toEqual([]);
  });

  it("fires today_above_average when today >> trailing avg", () => {
    const base = Array.from({ length: 10 }, (_, i) =>
      entry({ amount: 100, iso: `2026-05-${String(5 + i).padStart(2, "0")}T08:00:00Z` }),
    );
    const today = entry({ amount: 800, iso: "2026-05-15T09:00:00Z" });
    const r = dailyInsights({ entries: [...base, today], now: NOW });
    expect(r.find((i) => i.kind === "today_above_average")).toBeDefined();
  });

  it("does NOT fire today_above_average with too few prior days", () => {
    const r = dailyInsights({
      entries: [entry({ amount: 800, iso: "2026-05-15T09:00:00Z" })],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "today_above_average")).toBeUndefined();
  });

  it("flags dormant_merchant when visits ≥3 and last seen >12 days ago", () => {
    const r = dailyInsights({
      entries: [
        entry({ amount: 50, iso: "2026-04-20T10:00:00Z", merchant: "Cafe Java" }),
        entry({ amount: 50, iso: "2026-04-21T10:00:00Z", merchant: "Cafe Java" }),
        entry({ amount: 50, iso: "2026-04-22T10:00:00Z", merchant: "Cafe Java" }),
      ],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "dormant_merchant")).toBeDefined();
  });

  it("does NOT flag dormant_merchant with <3 visits", () => {
    const r = dailyInsights({
      entries: [
        entry({ amount: 50, iso: "2026-04-01T10:00:00Z", merchant: "OneOff Bar" }),
      ],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "dormant_merchant")).toBeUndefined();
  });

  it("flags duplicate_charges when 3+ similar amounts in same week", () => {
    const r = dailyInsights({
      entries: [
        entry({ amount: 19, iso: "2026-05-12T08:00:00Z", merchant: "Sub" }),
        entry({ amount: 19, iso: "2026-05-13T08:00:00Z", merchant: "Sub" }),
        entry({ amount: 19, iso: "2026-05-14T08:00:00Z", merchant: "Sub" }),
      ],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "duplicate_charges")).toBeDefined();
  });

  it("flags category_spike when today's category >> avg", () => {
    const past = Array.from({ length: 10 }, (_, i) =>
      entry({
        amount: 30,
        iso: `2026-05-${String(5 + i).padStart(2, "0")}T08:00:00Z`,
        category: "food",
        merchant: `m${i}`,
      }),
    );
    const todaySpike = entry({
      amount: 500,
      iso: "2026-05-15T09:00:00Z",
      category: "food",
      merchant: "today-restaurant",
    });
    const r = dailyInsights({
      entries: [...past, todaySpike],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "category_spike")).toBeDefined();
  });

  it("flags busiest_day when one weekday clearly exceeds the rest", () => {
    const r = dailyInsights({
      entries: [
        entry({ amount: 50, iso: "2026-05-10T08:00:00Z", merchant: "a" }),
        entry({ amount: 50, iso: "2026-05-11T08:00:00Z", merchant: "b" }),
        entry({ amount: 700, iso: "2026-05-12T08:00:00Z", merchant: "c" }),
        entry({ amount: 50, iso: "2026-05-13T08:00:00Z", merchant: "d" }),
      ],
      now: NOW,
    });
    expect(r.find((i) => i.kind === "busiest_day")).toBeDefined();
  });
});
