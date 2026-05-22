import { describe, expect, it } from "vitest";

import { simulateForecast } from "@/lib/what-if";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
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
    chargeDate: new Date(2026, 4, 20, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 20, 12, 0, 0).toISOString(),
    ...o,
  };
}

const NOW = new Date(2026, 4, 1, 8, 0, 0);

const BASE = {
  accounts: [bank({ anchorBalance: 5000 })],
  loans: [] as Loan[],
  incomes: [] as Income[],
  rules: [] as RecurringRule[],
  statuses: [] as RecurringStatus[],
  monthKey: "2026-05",
  now: NOW,
};

describe("simulateForecast", () => {
  it("no overrides → simulated equals baseline", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [entry({ amount: 500 })],
    });
    expect(r.baseline.forecast).toBe(r.simulated.forecast);
    expect(r.delta).toBe(0);
  });

  it("variableSpendCut 100% trims all future card slices", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [
        entry({ amount: 500, chargeDate: new Date(2026, 4, 20).toISOString() }),
        entry({ amount: 300, chargeDate: new Date(2026, 4, 28).toISOString() }),
      ],
      overrides: { variableSpendCut: 1 },
    });
    expect(r.baseline.futureCardSlices).toBe(800);
    expect(r.simulated.futureCardSlices).toBe(0);
    expect(r.delta).toBe(800);
  });

  it("variableSpendCut 50% halves remaining card spend", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [
        entry({ amount: 1000, chargeDate: new Date(2026, 4, 20).toISOString() }),
      ],
      overrides: { variableSpendCut: 0.5 },
    });
    expect(r.simulated.futureCardSlices).toBe(500);
    expect(r.delta).toBe(500);
  });

  it("extraIncome adds to forecast", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [],
      overrides: { extraIncome: 2500 },
    });
    expect(r.simulated.expectedIncome - r.baseline.expectedIncome).toBe(2500);
    expect(r.delta).toBe(2500);
  });

  it("extraOutflow subtracts from forecast", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [],
      overrides: { extraOutflow: 1500 },
    });
    expect(r.delta).toBe(-1500);
  });

  it("combines cut + income + outflow correctly", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [
        entry({ amount: 800, chargeDate: new Date(2026, 4, 25).toISOString() }),
      ],
      overrides: {
        variableSpendCut: 0.25,
        extraIncome: 1000,
        extraOutflow: 200,
      },
    });
    // savedFromCut = 800 * 0.25 = 200
    // delta = 200 + 1000 - 200 = 1000
    expect(r.delta).toBe(1000);
  });

  it("clamps cut to [0,1]", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [
        entry({ amount: 500, chargeDate: new Date(2026, 4, 20).toISOString() }),
      ],
      overrides: { variableSpendCut: 2 }, // clamped to 1
    });
    expect(r.simulated.futureCardSlices).toBe(0);
  });

  it("ignores negative income / outflow", () => {
    const r = simulateForecast({
      ...BASE,
      entries: [],
      overrides: { extraIncome: -500, extraOutflow: -200 },
    });
    expect(r.delta).toBe(0);
  });
});
