import { describe, expect, it } from "vitest";

import { todayPulse } from "@/lib/today-pulse";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: `e-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
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

describe("todayPulse", () => {
  it("zero on empty input", () => {
    const p = todayPulse({
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(p.spentToday).toBe(0);
    expect(p.countToday).toBe(0);
    expect(p.pendingForReview).toBe(0);
    expect(p.vibe).toBe("calm");
  });

  it("sums only today's slices", () => {
    const p = todayPulse({
      entries: [
        entry({ amount: 200, iso: "2026-05-15T09:00:00Z" }), // today
        entry({ amount: 50, iso: "2026-05-14T06:00:00Z" }),  // yesterday (TZ-safe)
      ],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(p.spentToday).toBe(200);
    expect(p.countToday).toBe(1);
  });

  it("separates refunds + counts pending entries awaiting review", () => {
    const p = todayPulse({
      entries: [
        entry({ amount: 100, iso: "2026-05-15T09:00:00Z" }),
        entry({ amount: 30, iso: "2026-05-15T09:00:00Z", isRefund: true }),
        entry({
          amount: 999,
          iso: "2026-05-15T08:00:00Z",
          needsConfirmation: true,
        }),
      ],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(p.spentToday).toBe(100);
    expect(p.refundedToday).toBe(30);
    expect(p.pendingForReview).toBe(1);
  });

  it("vibe escalates when today's spend exceeds allowance", () => {
    // monthlyBudget 1000, only ~mid-month → allowance ~60/day. 200 spent → hot
    const p = todayPulse({
      entries: [entry({ amount: 200, iso: "2026-05-15T09:00:00Z" })],
      rules: [],
      statuses: [],
      monthlyBudget: 1000,
      now: NOW,
    });
    expect(p.vibe).toBe("hot");
  });
});
