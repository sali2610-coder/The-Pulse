import { describe, expect, it } from "vitest";

import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 70,
    category: "entertainment",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10).toISOString(),
    createdAt: new Date(2026, 4, 10).toISOString(),
    merchant: "Netflix",
    ...overrides,
  };
}

const NOW = new Date(2026, 4, 20);

describe("detectSubscriptionCandidates", () => {
  it("detects a 3-month Netflix pattern", () => {
    const entries = [
      entry({
        chargeDate: new Date(2026, 1, 10).toISOString(),
        amount: 69.9,
      }),
      entry({
        chargeDate: new Date(2026, 2, 10).toISOString(),
        amount: 69.9,
      }),
      entry({
        chargeDate: new Date(2026, 3, 10).toISOString(),
        amount: 69.9,
      }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].displayName).toBe("Netflix");
    expect(candidates[0].suggestedAmount).toBe(69.9);
    expect(candidates[0].suggestedDay).toBe(10);
    expect(candidates[0].suggestedCategory).toBe("entertainment");
    expect(candidates[0].occurrenceCount).toBe(3);
    expect(candidates[0].meanGapDays).toBeGreaterThan(27);
    expect(candidates[0].meanGapDays).toBeLessThan(32);
  });

  it("skips merchants with fewer than 3 occurrences", () => {
    const entries = [
      entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("skips merchants already covered by an active rule (keyword match)", () => {
    const entries = [
      entry({ chargeDate: new Date(2026, 1, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
    ];
    const rule: RecurringRule = {
      id: "r1",
      label: "סטרימינג",
      category: "entertainment",
      estimatedAmount: 70,
      dayOfMonth: 10,
      keywords: ["netflix"],
      active: true,
      createdAt: new Date(2026, 0, 1).toISOString(),
    };
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [rule],
      now: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("skips non-monthly cadences", () => {
    // Weekly charges → gap ~7d → out of monthly window.
    const entries = [
      entry({
        merchant: "Coffee Co",
        chargeDate: new Date(2026, 3, 1).toISOString(),
        category: "food",
      }),
      entry({
        merchant: "Coffee Co",
        chargeDate: new Date(2026, 3, 8).toISOString(),
        category: "food",
      }),
      entry({
        merchant: "Coffee Co",
        chargeDate: new Date(2026, 3, 15).toISOString(),
        category: "food",
      }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("skips merchants with high amount drift", () => {
    const entries = [
      entry({
        merchant: "Random Shop",
        chargeDate: new Date(2026, 1, 10).toISOString(),
        amount: 50,
      }),
      entry({
        merchant: "Random Shop",
        chargeDate: new Date(2026, 2, 10).toISOString(),
        amount: 300,
      }),
      entry({
        merchant: "Random Shop",
        chargeDate: new Date(2026, 3, 10).toISOString(),
        amount: 80,
      }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("ignores manual entries (user-managed already)", () => {
    const entries = [
      entry({
        source: "manual",
        chargeDate: new Date(2026, 1, 10).toISOString(),
      }),
      entry({
        source: "manual",
        chargeDate: new Date(2026, 2, 10).toISOString(),
      }),
      entry({
        source: "manual",
        chargeDate: new Date(2026, 3, 10).toISOString(),
      }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("scores high-confidence when 4+ stable occurrences", () => {
    const entries = [
      entry({ chargeDate: new Date(2026, 0, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 1, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
      entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
    ];
    const candidates = detectSubscriptionCandidates({
      entries,
      rules: [],
      now: NOW,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe("high");
  });
});
