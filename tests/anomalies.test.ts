import { describe, expect, it } from "vitest";
import { detectAnomalies } from "@/lib/anomalies";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 12, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 12, 12, 0, 0).toISOString(),
    merchant: "Shufersal",
    ...overrides,
  };
}

const MAY = "2026-05";

describe("detectAnomalies", () => {
  it("flags a current-month charge ≥ 1.5× and ≥ ₪20 over the baseline", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 200, chargeDate: new Date(2026, 2, 12).toISOString() }),
      entry({ id: "b2", amount: 210, chargeDate: new Date(2026, 3, 12).toISOString() }),
      // May charge: 450 → factor 2.2× over 205 median, delta 245 → flagged.
      entry({ id: "x1", amount: 450, chargeDate: new Date(2026, 4, 12).toISOString() }),
    ];
    const out = detectAnomalies({ entries, monthKey: MAY });
    expect(out.length).toBe(1);
    expect(out[0].entryId).toBe("x1");
    expect(out[0].factor).toBeGreaterThanOrEqual(1.5);
    expect(out[0].baseline).toBeCloseTo(205, 0);
  });

  it("ignores small absolute deltas even when factor is high", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 12, chargeDate: new Date(2026, 2, 12).toISOString() }),
      entry({ id: "b2", amount: 14, chargeDate: new Date(2026, 3, 12).toISOString() }),
      // 18 vs 13 median → factor 1.38 but delta only 5 → no flag.
      entry({ id: "x1", amount: 18, chargeDate: new Date(2026, 4, 12).toISOString() }),
    ];
    expect(detectAnomalies({ entries, monthKey: MAY })).toEqual([]);
  });

  it("requires at least 2 baseline observations", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 200, chargeDate: new Date(2026, 3, 12).toISOString() }),
      entry({ id: "x1", amount: 450, chargeDate: new Date(2026, 4, 12).toISOString() }),
    ];
    expect(detectAnomalies({ entries, monthKey: MAY })).toEqual([]);
  });

  it("doesn't flag charges close to the baseline", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 200, chargeDate: new Date(2026, 2, 12).toISOString() }),
      entry({ id: "b2", amount: 200, chargeDate: new Date(2026, 3, 12).toISOString() }),
      entry({ id: "x1", amount: 210, chargeDate: new Date(2026, 4, 12).toISOString() }),
    ];
    expect(detectAnomalies({ entries, monthKey: MAY })).toEqual([]);
  });

  it("skips refunds / pending / FX / needsConfirmation", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 200, chargeDate: new Date(2026, 2, 12).toISOString() }),
      entry({ id: "b2", amount: 200, chargeDate: new Date(2026, 3, 12).toISOString() }),
      entry({
        id: "x1",
        amount: 450,
        chargeDate: new Date(2026, 4, 12).toISOString(),
        isRefund: true,
      }),
      entry({
        id: "x2",
        amount: 450,
        chargeDate: new Date(2026, 4, 13).toISOString(),
        bankPending: true,
      }),
      entry({
        id: "x3",
        amount: 450,
        chargeDate: new Date(2026, 4, 14).toISOString(),
        currency: "USD",
      }),
      entry({
        id: "x4",
        amount: 450,
        chargeDate: new Date(2026, 4, 15).toISOString(),
        needsConfirmation: true,
      }),
    ];
    expect(detectAnomalies({ entries, monthKey: MAY })).toEqual([]);
  });

  it("uses sliced amounts for installment entries", () => {
    // Jan 12, 12 installments, 2400 total → 200/month. May should not flag.
    const entries: ExpenseEntry[] = [
      entry({
        id: "i1",
        amount: 2400,
        installments: 12,
        chargeDate: new Date(2026, 0, 12).toISOString(),
      }),
      entry({ id: "b1", amount: 200, chargeDate: new Date(2026, 2, 12).toISOString() }),
      entry({ id: "b2", amount: 220, chargeDate: new Date(2026, 3, 12).toISOString() }),
    ];
    expect(detectAnomalies({ entries, monthKey: MAY })).toEqual([]);
  });

  it("sorts results by factor descending", () => {
    const entries: ExpenseEntry[] = [
      // Shufersal baseline 200 → May charge 400 (factor 2.0)
      entry({
        id: "b1",
        merchant: "Shufersal",
        amount: 200,
        chargeDate: new Date(2026, 2, 12).toISOString(),
      }),
      entry({
        id: "b2",
        merchant: "Shufersal",
        amount: 200,
        chargeDate: new Date(2026, 3, 12).toISOString(),
      }),
      entry({
        id: "shuf",
        merchant: "Shufersal",
        amount: 400,
        chargeDate: new Date(2026, 4, 12).toISOString(),
      }),
      // Cofix baseline 25 → May charge 80 (factor 3.2)
      entry({
        id: "c1",
        merchant: "Cofix",
        category: "food",
        amount: 25,
        chargeDate: new Date(2026, 2, 12).toISOString(),
      }),
      entry({
        id: "c2",
        merchant: "Cofix",
        category: "food",
        amount: 25,
        chargeDate: new Date(2026, 3, 12).toISOString(),
      }),
      entry({
        id: "cofix",
        merchant: "Cofix",
        category: "food",
        amount: 80,
        chargeDate: new Date(2026, 4, 12).toISOString(),
      }),
    ];
    const out = detectAnomalies({ entries, monthKey: MAY });
    expect(out.length).toBe(2);
    expect(out[0].entryId).toBe("cofix");
    expect(out[1].entryId).toBe("shuf");
  });
});
