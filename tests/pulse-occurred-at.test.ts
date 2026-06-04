// Phase 355 — Pulse must read occurredAt, not createdAt. A back-dated
// row created today belongs to its picked day, not today.

import { describe, expect, it } from "vitest";

import { todayPulse } from "@/lib/today-pulse";
import type { ExpenseEntry, RecurringRule, RecurringStatus } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "supermarket",
    source: "manual",
    paymentMethod: "cash",
    installments: 1,
    chargeDate: new Date(2026, 5, 4, 21, 30, 0).toISOString(),
    createdAt: new Date(2026, 5, 4, 21, 30, 0).toISOString(),
    ...o,
  };
}

const NOW = new Date(2026, 5, 4, 22, 0, 0); // June 4 22:00
const BASE = {
  rules: [] as RecurringRule[],
  statuses: [] as RecurringStatus[],
  monthlyBudget: 0,
  now: NOW,
};

describe("today-pulse honors occurredAt", () => {
  it("back-dated entry (occurredAt yesterday) is NOT in today's spentToday", () => {
    const yesterday = new Date(2026, 5, 3, 18, 0, 0).toISOString();
    const today = new Date(2026, 5, 4, 22, 0, 0).toISOString();
    const result = todayPulse({
      ...BASE,
      entries: [
        entry({
          amount: 540,
          occurredAt: yesterday,
          chargeDate: yesterday,
          createdAt: today, // user typed it today
        }),
      ],
    });
    expect(result.spentToday).toBe(0);
    expect(result.countToday).toBe(0);
  });

  it("entry occurred today appears in today Pulse", () => {
    const today = new Date(2026, 5, 4, 18, 0, 0).toISOString();
    const result = todayPulse({
      ...BASE,
      entries: [
        entry({
          amount: 250,
          occurredAt: today,
          chargeDate: today,
          createdAt: today,
        }),
      ],
    });
    expect(result.spentToday).toBe(250);
    expect(result.countToday).toBe(1);
  });

  it("falls back to chargeDate when occurredAt is missing", () => {
    const today = new Date(2026, 5, 4, 18, 0, 0).toISOString();
    const result = todayPulse({
      ...BASE,
      entries: [
        entry({
          amount: 80,
          // No occurredAt — legacy entry.
          chargeDate: today,
          createdAt: today,
        }),
      ],
    });
    expect(result.spentToday).toBe(80);
  });
});
