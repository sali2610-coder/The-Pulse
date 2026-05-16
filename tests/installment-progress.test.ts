import { describe, expect, it } from "vitest";
import { installmentProgress } from "@/lib/projections";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e",
    amount: 2700,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 27,
    chargeDate: new Date(2026, 0, 15, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 0, 15, 12, 0, 0).toISOString(),
    ...overrides,
  };
}

describe("installmentProgress", () => {
  it("counts paid + remaining for an in-progress installment plan", () => {
    // chargeDate Jan 15 2026, 27 installments; now = May 20 2026
    const p = installmentProgress(entry(), new Date(2026, 4, 20, 12, 0, 0));
    // Jan, Feb, Mar, Apr, May all already on/before May 20.
    expect(p.total).toBe(27);
    expect(p.paid).toBe(5);
    expect(p.remaining).toBe(22);
    expect(p.paidAmount).toBeCloseTo(500, 5);
    expect(p.remainingAmount).toBeCloseTo(2200, 5);
    expect(p.nextIndex).toBe(6);
    expect(p.nextChargeDate?.getMonth()).toBe(5); // June (0-indexed)
    expect(p.nextChargeDate?.getDate()).toBe(15);
    expect(p.isComplete).toBe(false);
  });

  it("reports completion at the final installment", () => {
    // chargeDate Jan 15 2026, 3 installments; now = May 2026 (past last)
    const p = installmentProgress(
      entry({ installments: 3 }),
      new Date(2026, 4, 1, 12, 0, 0),
    );
    expect(p.paid).toBe(3);
    expect(p.remaining).toBe(0);
    expect(p.isComplete).toBe(true);
    expect(p.nextIndex).toBeUndefined();
    expect(p.nextChargeDate).toBeUndefined();
  });

  it("treats single-charge entries as 1-of-1", () => {
    const p = installmentProgress(
      entry({ installments: 1, amount: 199 }),
      new Date(2026, 4, 1, 12, 0, 0),
    );
    expect(p.total).toBe(1);
    expect(p.paid).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.paidAmount).toBe(199);
    expect(p.isComplete).toBe(true);
  });

  it("counts paid=0 when chargeDate is in the future", () => {
    const p = installmentProgress(
      entry({
        installments: 4,
        chargeDate: new Date(2026, 11, 15, 12, 0, 0).toISOString(),
      }),
      new Date(2026, 4, 1, 12, 0, 0),
    );
    expect(p.paid).toBe(0);
    expect(p.nextIndex).toBe(1);
    expect(p.nextChargeDate?.getMonth()).toBe(11);
  });

  it("clamps day-of-month for short February", () => {
    const p = installmentProgress(
      entry({
        installments: 3,
        chargeDate: new Date(2026, 0, 31, 12, 0, 0).toISOString(), // Jan 31
      }),
      new Date(2026, 1, 28, 12, 0, 0), // Feb 28 — slice should land on Feb 28
    );
    // Jan 31 paid, Feb 28 paid (today), Mar 31 not yet.
    expect(p.paid).toBe(2);
    expect(p.nextChargeDate?.getMonth()).toBe(2); // March
    expect(p.nextChargeDate?.getDate()).toBe(31);
  });
});
