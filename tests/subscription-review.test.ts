import { describe, expect, it } from "vitest";

import { subscriptionReview } from "@/lib/subscription-review";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function rule(opts: Partial<RecurringRule> & { id: string; label: string }): RecurringRule {
  return {
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function matchedEntry(
  ruleId: string,
  amount: number,
  iso: string,
): ExpenseEntry {
  return {
    id: `m-${ruleId}-${iso}-${amount}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "bills",
    source: "manual",
    matchedRuleId: ruleId,
    createdAt: iso,
  };
}

describe("subscriptionReview", () => {
  it("returns empty when no rules exist", () => {
    const r = subscriptionReview({ rules: [], entries: [], now: NOW });
    expect(r).toEqual([]);
  });

  it("flags stale_no_charge when last match is >45 days old", () => {
    const r = rule({ id: "r1", label: "Old Sub" });
    const old = matchedEntry(
      r.id,
      80,
      new Date("2026-02-15T00:00:00.000Z").toISOString(),
    );
    const out = subscriptionReview({
      rules: [r],
      entries: [old],
      now: NOW,
    });
    const stale = out.find((c) => c.reason === "stale_no_charge");
    expect(stale).toBeDefined();
  });

  it("does NOT flag stale when match is recent", () => {
    const r = rule({ id: "r1", label: "Fresh" });
    const recent = matchedEntry(
      r.id,
      80,
      new Date("2026-05-10T00:00:00.000Z").toISOString(),
    );
    const out = subscriptionReview({
      rules: [r],
      entries: [recent],
      now: NOW,
    });
    expect(out.find((c) => c.reason === "stale_no_charge")).toBeUndefined();
  });

  it("flags rising_price when MoM jump >=15%", () => {
    const r = rule({ id: "r1", label: "Streaming", estimatedAmount: 80 });
    const out = subscriptionReview({
      rules: [r],
      entries: [
        matchedEntry(r.id, 100, "2026-04-05T00:00:00.000Z"), // m1
        matchedEntry(r.id, 80, "2026-03-05T00:00:00.000Z"),  // m2 → +25%
        matchedEntry(r.id, 80, "2026-02-05T00:00:00.000Z"),  // m3
      ],
      now: NOW,
    });
    expect(out.find((c) => c.reason === "rising_price")).toBeDefined();
  });

  it("flags duplicate_lookalike when two rules share a label token + category", () => {
    const a = rule({ id: "r1", label: "Netflix Family" });
    const b = rule({ id: "r2", label: "Netflix Premium" });
    const out = subscriptionReview({
      rules: [a, b],
      entries: [
        matchedEntry(a.id, 80, "2026-05-01T00:00:00.000Z"),
        matchedEntry(b.id, 80, "2026-05-01T00:00:00.000Z"),
      ],
      now: NOW,
    });
    const dup = out.find((c) => c.reason === "duplicate_lookalike");
    expect(dup).toBeDefined();
    expect(dup?.duplicateOfRuleId).toBe(a.id);
  });

  it("does NOT flag duplicate when only short overlap (e.g. 'a')", () => {
    const a = rule({ id: "r1", label: "A Sub" });
    const b = rule({ id: "r2", label: "A Different" });
    const out = subscriptionReview({
      rules: [a, b],
      entries: [
        matchedEntry(a.id, 50, "2026-05-01T00:00:00.000Z"),
        matchedEntry(b.id, 50, "2026-05-01T00:00:00.000Z"),
      ],
      now: NOW,
    });
    expect(out.find((c) => c.reason === "duplicate_lookalike")).toBeUndefined();
  });

  it("flags low_value_signal for small charges with sparse matches", () => {
    const r = rule({ id: "r1", label: "Tiny", estimatedAmount: 12 });
    const out = subscriptionReview({
      rules: [r],
      entries: [
        matchedEntry(r.id, 12, "2026-05-03T00:00:00.000Z"),
      ],
      now: NOW,
    });
    expect(out.find((c) => c.reason === "low_value_signal")).toBeDefined();
  });

  it("ignores inactive rules entirely", () => {
    const r = rule({ id: "r1", label: "Off", active: false });
    const out = subscriptionReview({
      rules: [r],
      entries: [matchedEntry(r.id, 12, "2026-01-01T00:00:00.000Z")],
      now: NOW,
    });
    expect(out).toEqual([]);
  });
});
