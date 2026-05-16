import { describe, expect, it } from "vitest";
import { detectSubscriptionCandidates } from "@/lib/subscriptions";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 56,
    category: "entertainment",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 0, 15).toISOString(),
    createdAt: new Date(2026, 0, 15).toISOString(),
    merchant: "Netflix",
    ...overrides,
  };
}

describe("detectSubscriptionCandidates", () => {
  it("surfaces a 3-month recurring merchant with stable amount", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "n1", chargeDate: new Date(2026, 0, 15).toISOString() }),
      entry({
        id: "n2",
        chargeDate: new Date(2026, 1, 15).toISOString(),
        amount: 58,
      }),
      entry({
        id: "n3",
        chargeDate: new Date(2026, 2, 15).toISOString(),
        amount: 56,
      }),
    ];
    const out = detectSubscriptionCandidates({ entries, rules: [] });
    expect(out.length).toBe(1);
    expect(out[0].merchant).toBe("Netflix");
    expect(out[0].observations).toBe(3);
    expect(out[0].estimatedAmount).toBeCloseTo(56, 0);
    expect(out[0].dayOfMonth).toBe(15);
    expect(out[0].keywords).toEqual(["Netflix"]);
  });

  it("ignores merchants with only two observations", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "n1", chargeDate: new Date(2026, 0, 15).toISOString() }),
      entry({ id: "n2", chargeDate: new Date(2026, 1, 15).toISOString() }),
    ];
    expect(detectSubscriptionCandidates({ entries, rules: [] })).toEqual([]);
  });

  it("ignores merchants whose amounts vary > 15%", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "n1", amount: 56, chargeDate: new Date(2026, 0, 15).toISOString() }),
      entry({ id: "n2", amount: 56, chargeDate: new Date(2026, 1, 15).toISOString() }),
      entry({ id: "n3", amount: 90, chargeDate: new Date(2026, 2, 15).toISOString() }),
    ];
    expect(detectSubscriptionCandidates({ entries, rules: [] })).toEqual([]);
  });

  it("skips merchants already covered by an existing rule", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "n1", chargeDate: new Date(2026, 0, 15).toISOString() }),
      entry({ id: "n2", chargeDate: new Date(2026, 1, 15).toISOString() }),
      entry({ id: "n3", chargeDate: new Date(2026, 2, 15).toISOString() }),
    ];
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Netflix",
        category: "entertainment",
        estimatedAmount: 56,
        dayOfMonth: 15,
        keywords: [],
        active: true,
        createdAt: new Date(2026, 0, 1).toISOString(),
      },
    ];
    expect(detectSubscriptionCandidates({ entries, rules })).toEqual([]);
  });

  it("treats installment entries as their per-month slice", () => {
    const entries: ExpenseEntry[] = [
      // 1200 / 12 = 100 per month — should count as a 100 subscription
      entry({
        id: "i1",
        merchant: "iPhone Plan",
        amount: 1200,
        installments: 12,
        category: "bills",
        chargeDate: new Date(2026, 0, 5).toISOString(),
      }),
      entry({
        id: "i2",
        merchant: "iPhone Plan",
        amount: 1200,
        installments: 12,
        category: "bills",
        chargeDate: new Date(2026, 1, 5).toISOString(),
      }),
      entry({
        id: "i3",
        merchant: "iPhone Plan",
        amount: 1200,
        installments: 12,
        category: "bills",
        chargeDate: new Date(2026, 2, 5).toISOString(),
      }),
    ];
    const out = detectSubscriptionCandidates({ entries, rules: [] });
    expect(out.length).toBe(1);
    expect(out[0].estimatedAmount).toBeCloseTo(100, 0);
  });

  it("skips refunds, needsConfirmation, and tiny amounts", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "n1", isRefund: true, chargeDate: new Date(2026, 0, 15).toISOString() }),
      entry({
        id: "n2",
        needsConfirmation: true,
        chargeDate: new Date(2026, 1, 15).toISOString(),
      }),
      entry({ id: "n3", amount: 3, chargeDate: new Date(2026, 2, 15).toISOString() }),
    ];
    expect(detectSubscriptionCandidates({ entries, rules: [] })).toEqual([]);
  });

  it("sorts by observations desc, then amount desc", () => {
    const make = (id: string, merchant: string, month: number, amount: number) =>
      entry({
        id,
        merchant,
        amount,
        chargeDate: new Date(2026, month, 10).toISOString(),
      });
    const entries: ExpenseEntry[] = [
      // Netflix: 3 months @ ~56
      make("a", "Netflix", 0, 56),
      make("b", "Netflix", 1, 56),
      make("c", "Netflix", 2, 56),
      // Spotify: 4 months @ ~20
      make("d", "Spotify", 0, 20),
      make("e", "Spotify", 1, 20),
      make("f", "Spotify", 2, 20),
      make("g", "Spotify", 3, 20),
    ];
    const out = detectSubscriptionCandidates({ entries, rules: [] });
    expect(out[0].merchant).toBe("Spotify");
    expect(out[1].merchant).toBe("Netflix");
  });
});
