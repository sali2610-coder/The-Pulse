import { describe, expect, it } from "vitest";

import { merchantDetail } from "@/lib/merchant-detail";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, id, ...rest } = opts;
  return {
    id: id ?? `e-${iso}-${amount}`,
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

describe("merchantDetail", () => {
  it("returns a low-confidence shell when no merchant + no rule", () => {
    const e = entry({ amount: 50, iso: "2026-05-15T10:00:00Z" });
    const d = merchantDetail({ entry: e, entries: [e], now: NOW });
    expect(d.confidence).toBe("low");
    expect(d.visits90).toBe(0);
  });

  it("counts prior visits + averages ticket size over 90 days", () => {
    const focus = entry({
      amount: 60,
      iso: "2026-05-15T10:00:00Z",
      merchant: "שופרסל",
    });
    const others = [
      entry({ amount: 30, iso: "2026-05-01T10:00:00Z", merchant: "שופרסל" }),
      entry({ amount: 40, iso: "2026-04-20T10:00:00Z", merchant: "שופרסל סניף 12" }),
      entry({ amount: 50, iso: "2026-03-10T10:00:00Z", merchant: "שופרסל" }),
    ];
    const d = merchantDetail({
      entry: focus,
      entries: [focus, ...others],
      now: NOW,
    });
    expect(d.visits90).toBe(3);
    expect(d.averageTicket).toBeCloseTo(40, 2);
    expect(d.daysSinceLast).toBeGreaterThan(0);
    expect(d.confidence).toBe("medium");
  });

  it("flags isUnusual when entry ≥ 1.5x average", () => {
    const focus = entry({
      amount: 300,
      iso: "2026-05-15T10:00:00Z",
      merchant: "Cafe",
    });
    const others = [
      entry({ amount: 50, iso: "2026-05-01T08:00:00Z", merchant: "Cafe" }),
      entry({ amount: 50, iso: "2026-04-25T08:00:00Z", merchant: "Cafe" }),
      entry({ amount: 50, iso: "2026-04-10T08:00:00Z", merchant: "Cafe" }),
    ];
    const d = merchantDetail({
      entry: focus,
      entries: [focus, ...others],
      now: NOW,
    });
    expect(d.isUnusual).toBe(true);
  });

  it("does NOT flag isUnusual with fewer than 3 priors", () => {
    const focus = entry({
      amount: 300,
      iso: "2026-05-15T10:00:00Z",
      merchant: "Cafe",
    });
    const d = merchantDetail({
      entry: focus,
      entries: [focus],
      now: NOW,
    });
    expect(d.isUnusual).toBe(false);
  });

  it("attaches the linked rule + lookalike subs in the same category", () => {
    const rule: RecurringRule = {
      id: "rule-1",
      label: "Netflix Family",
      category: "entertainment",
      estimatedAmount: 60,
      dayOfMonth: 5,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const sibling: RecurringRule = {
      id: "rule-2",
      label: "Netflix Premium",
      category: "entertainment",
      estimatedAmount: 60,
      dayOfMonth: 6,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const unrelated: RecurringRule = {
      id: "rule-3",
      label: "Gym",
      category: "health",
      estimatedAmount: 100,
      dayOfMonth: 10,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const e = entry({
      amount: 60,
      iso: "2026-05-15T10:00:00Z",
      merchant: "Netflix",
      matchedRuleId: rule.id,
    });
    const d = merchantDetail({
      entry: e,
      entries: [e],
      rules: [rule, sibling, unrelated],
      now: NOW,
    });
    expect(d.matchedRule?.id).toBe(rule.id);
    expect(d.linkedSubs.map((r) => r.id)).toEqual([sibling.id]);
    expect(d.confidence).toBe("high");
  });

  it("populates installmentContext for plans > 1", () => {
    const e = entry({
      amount: 1200,
      iso: "2026-03-15T10:00:00Z",
      merchant: "TV",
      installments: 12,
    });
    const d = merchantDetail({
      entry: e,
      entries: [e],
      now: NOW,
    });
    expect(d.installmentContext).not.toBeNull();
    expect(d.installmentContext?.total).toBe(12);
    expect(d.installmentContext?.perMonth).toBe(100);
  });
});
