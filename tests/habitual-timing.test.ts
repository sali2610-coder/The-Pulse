import { describe, expect, it } from "vitest";

import { habitualTimingHints } from "@/lib/habitual-timing";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function rule(opts: Partial<RecurringRule> & { id: string; label: string }): RecurringRule {
  return {
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...opts,
  };
}

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string; matchedRuleId: string }): ExpenseEntry {
  const { amount, iso, matchedRuleId, ...rest } = opts;
  return {
    id: `e-${iso}-${matchedRuleId}-${Math.random().toString(36).slice(2, 6)}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "bills",
    source: "manual",
    matchedRuleId,
    createdAt: iso,
    ...rest,
  };
}

describe("habitualTimingHints", () => {
  it("returns nothing for sparse data", () => {
    const r = habitualTimingHints({
      rules: [rule({ id: "r1", label: "Phone", dayOfMonth: 10 })],
      entries: [
        entry({ amount: 100, iso: "2026-05-12T10:00:00Z", matchedRuleId: "r1" }),
      ],
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it("returns hint when observed median drifts >=3 days from declared", () => {
    const r1 = rule({ id: "r1", label: "Phone", dayOfMonth: 10 });
    const r = habitualTimingHints({
      rules: [r1],
      entries: [
        entry({ amount: 100, iso: "2026-04-15T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-03-16T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-02-14T10:00:00Z", matchedRuleId: "r1" }),
      ],
      now: NOW,
    });
    expect(r).toHaveLength(1);
    expect(r[0].declaredDayOfMonth).toBe(10);
    expect(r[0].observedMedianDay).toBe(15);
    expect(r[0].drift).toBe(5);
  });

  it("does not surface hint when drift < 3 days", () => {
    const r1 = rule({ id: "r1", label: "Phone", dayOfMonth: 10 });
    const r = habitualTimingHints({
      rules: [r1],
      entries: [
        entry({ amount: 100, iso: "2026-04-11T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-03-12T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-02-09T10:00:00Z", matchedRuleId: "r1" }),
      ],
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it("ignores refunds + pending entries", () => {
    const r1 = rule({ id: "r1", label: "Phone", dayOfMonth: 10 });
    const r = habitualTimingHints({
      rules: [r1],
      entries: [
        entry({
          amount: 100,
          iso: "2026-04-25T10:00:00Z",
          matchedRuleId: "r1",
          isRefund: true,
        }),
        entry({
          amount: 100,
          iso: "2026-03-25T10:00:00Z",
          matchedRuleId: "r1",
          needsConfirmation: true,
        }),
      ],
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it("inactive rules excluded", () => {
    const r1 = rule({ id: "r1", label: "Phone", dayOfMonth: 10, active: false });
    const r = habitualTimingHints({
      rules: [r1],
      entries: [
        entry({ amount: 100, iso: "2026-04-15T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-03-15T10:00:00Z", matchedRuleId: "r1" }),
        entry({ amount: 100, iso: "2026-02-15T10:00:00Z", matchedRuleId: "r1" }),
      ],
      now: NOW,
    });
    expect(r).toEqual([]);
  });
});
