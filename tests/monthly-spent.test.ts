import { describe, expect, it } from "vitest";

import { monthlySpent } from "@/lib/monthly-spent";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-20T10:00:00.000Z");

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

describe("monthlySpent", () => {
  it("returns zero on empty entries", () => {
    const m = monthlySpent({ entries: [], now: NOW });
    expect(m.spentSoFar).toBe(0);
    expect(m.charges).toBe(0);
    expect(m.refundCredit).toBe(0);
  });

  it("sums slices charged this month up to now", () => {
    const m = monthlySpent({
      entries: [
        entry({ amount: 200, iso: "2026-05-05T10:00:00Z" }),
        entry({ amount: 150, iso: "2026-05-12T10:00:00Z" }),
      ],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(350);
    expect(m.charges).toBe(2);
  });

  it("excludes future-dated slices in the same month", () => {
    const m = monthlySpent({
      entries: [entry({ amount: 999, iso: "2026-05-28T10:00:00Z" })],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(0);
  });

  it("excludes refunds from spentSoFar and reports them separately", () => {
    const m = monthlySpent({
      entries: [
        entry({ amount: 200, iso: "2026-05-05T10:00:00Z" }),
        entry({ amount: 50, iso: "2026-05-06T10:00:00Z", isRefund: true }),
      ],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(200);
    expect(m.refundCredit).toBe(50);
  });

  it("excludes pending / needsConfirmation / excludeFromBudget / FX", () => {
    const m = monthlySpent({
      entries: [
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", needsConfirmation: true }),
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", bankPending: true }),
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", excludeFromBudget: true }),
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", currency: "USD" }),
      ],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(0);
    expect(m.charges).toBe(0);
  });

  it("counts only this month's slices, not prior month's", () => {
    const m = monthlySpent({
      entries: [
        entry({ amount: 1000, iso: "2026-04-15T10:00:00Z" }),
        entry({ amount: 200, iso: "2026-05-10T10:00:00Z" }),
      ],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(200);
  });

  it("contributes a single per-month slice from a multi-installment plan", () => {
    const m = monthlySpent({
      entries: [
        entry({ amount: 1200, iso: "2026-05-05T10:00:00Z", installments: 12 }),
      ],
      now: NOW,
    });
    expect(m.spentSoFar).toBe(100);
  });
});
