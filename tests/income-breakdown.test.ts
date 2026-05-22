import { describe, expect, it } from "vitest";

import { incomeBreakdown } from "@/lib/income-breakdown";
import type { ExpenseEntry, Income } from "@/types/finance";

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: "salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    ...o,
  };
}

describe("incomeBreakdown", () => {
  it("empty inputs → zero total + no sources", () => {
    const b = incomeBreakdown({
      incomes: [],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(0);
    expect(b.sources).toEqual([]);
  });

  it("aggregates a single active income", () => {
    const b = incomeBreakdown({
      incomes: [income({ amount: 15000 })],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(15000);
    expect(b.sources).toHaveLength(1);
    expect(b.sources[0].share).toBe(1);
  });

  it("computes share across multiple sources", () => {
    const b = incomeBreakdown({
      incomes: [
        income({ id: "main", amount: 12000, label: "primary" }),
        income({ id: "side", amount: 3000, label: "side gig" }),
      ],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(15000);
    const main = b.sources.find((s) => s.id === "main")!;
    const side = b.sources.find((s) => s.id === "side")!;
    expect(main.share).toBeCloseTo(0.8, 5);
    expect(side.share).toBeCloseTo(0.2, 5);
  });

  it("excludes inactive incomes", () => {
    const b = incomeBreakdown({
      incomes: [
        income({ id: "off", amount: 5000, active: false }),
        income({ id: "on", amount: 8000 }),
      ],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(8000);
  });

  it("folds refund credit as a synthetic source", () => {
    const b = incomeBreakdown({
      incomes: [income({ amount: 10000 })],
      entries: [
        entry({ amount: 200, isRefund: true }),
        entry({ amount: 300, isRefund: true }),
      ],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(10500);
    const r = b.sources.find((s) => s.isRefund);
    expect(r?.amount).toBe(500);
  });

  it("skips noisy refund entries (needsConfirmation / non-ILS)", () => {
    const b = incomeBreakdown({
      incomes: [],
      entries: [
        entry({ amount: 100, isRefund: true, needsConfirmation: true }),
        entry({ amount: 100, isRefund: true, currency: "USD" }),
        entry({ amount: 100, isRefund: true }),
      ],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(100);
  });

  it("sorts sources by amount DESC", () => {
    const b = incomeBreakdown({
      incomes: [
        income({ id: "small", amount: 1000 }),
        income({ id: "big", amount: 10000 }),
        income({ id: "mid", amount: 4000 }),
      ],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.sources.map((s) => s.id)).toEqual(["big", "mid", "small"]);
  });

  it("ignores zero-amount or negative incomes", () => {
    const b = incomeBreakdown({
      incomes: [
        income({ id: "zero", amount: 0 }),
        income({ id: "neg", amount: -100 }),
        income({ id: "real", amount: 5000 }),
      ],
      entries: [],
      monthKey: "2026-05",
    });
    expect(b.totalMonthly).toBe(5000);
    expect(b.sources.map((s) => s.id)).toEqual(["real"]);
  });
});
