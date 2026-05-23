import { describe, expect, it } from "vitest";

import { runwayReport } from "@/lib/runway";
import type { Account, ExpenseEntry, Income } from "@/types/finance";

const NOW = new Date(2026, 4, 15, 12, 0, 0);

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 10000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: "salary",
    amount: 5000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 1000,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 3, 10, 12, 0, 0).toISOString(), // April
    createdAt: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
    ...o,
  };
}

describe("runwayReport", () => {
  it("empty inputs → baseline Infinity, scenarios respect outflow", () => {
    const r = runwayReport({
      accounts: [],
      incomes: [],
      entries: [],
      now: NOW,
    });
    expect(r.baseline.monthsOfRunway).toBe(Number.POSITIVE_INFINITY);
    expect(r.scenarios).toHaveLength(3);
  });

  it("baseline = inflow positive cancels outflow → Infinity", () => {
    const r = runwayReport({
      accounts: [bank()],
      incomes: [income({ amount: 5000 })],
      entries: [entry({ amount: 4000 })], // April only
      now: NOW,
      lookback: 1,
    });
    expect(r.baseline.monthlyOutflow).toBe(4000);
    expect(r.baseline.monthlyInflow).toBe(5000);
    expect(r.baseline.monthlyNet).toBe(1000);
    expect(r.baseline.monthsOfRunway).toBe(Number.POSITIVE_INFINITY);
  });

  it("baseline cash-flow negative → liquid ÷ drain", () => {
    const r = runwayReport({
      accounts: [bank({ anchorBalance: 12000 })],
      incomes: [income({ amount: 2000 })],
      entries: [entry({ amount: 5000 })],
      now: NOW,
      lookback: 1,
    });
    // drain = 5000 - 2000 = 3000. runway = 12000 / 3000 = 4
    expect(r.baseline.monthsOfRunway).toBe(4);
  });

  it("lost-primary scenario removes the LARGEST income", () => {
    const r = runwayReport({
      accounts: [bank({ anchorBalance: 6000 })],
      incomes: [
        income({ id: "main", amount: 5000 }),
        income({ id: "side", amount: 1000 }),
      ],
      entries: [entry({ amount: 3000 })],
      now: NOW,
      lookback: 1,
    });
    const lost = r.scenarios.find((s) => s.id === "lost_primary")!;
    expect(lost.monthlyInflow).toBe(1000); // side gig only
    // drain = 3000 - 1000 = 2000 → runway = 6000/2000 = 3
    expect(lost.monthsOfRunway).toBe(3);
  });

  it("no-income scenario uses 0 inflow", () => {
    const r = runwayReport({
      accounts: [bank({ anchorBalance: 6000 })],
      incomes: [income({ amount: 5000 })],
      entries: [entry({ amount: 3000 })],
      now: NOW,
      lookback: 1,
    });
    const no = r.scenarios.find((s) => s.id === "no_income")!;
    expect(no.monthlyInflow).toBe(0);
    expect(no.monthsOfRunway).toBe(2); // 6000 / 3000
  });

  it("outflow-shock multiplies baseline outflow", () => {
    const r = runwayReport({
      accounts: [bank({ anchorBalance: 6000 })],
      incomes: [income({ amount: 1000 })],
      entries: [entry({ amount: 2000 })],
      now: NOW,
      lookback: 1,
      shockMultiplier: 2,
    });
    const sh = r.scenarios.find((s) => s.id === "outflow_shock")!;
    expect(sh.monthlyOutflow).toBe(4000);
    // drain = 4000 - 1000 = 3000 → runway = 6000/3000 = 2
    expect(sh.monthsOfRunway).toBe(2);
  });

  it("excludes overdraft (negative) banks from liquid", () => {
    const r = runwayReport({
      accounts: [
        bank({ id: "good", anchorBalance: 10000 }),
        bank({ id: "ov", anchorBalance: -5000 }),
      ],
      incomes: [],
      entries: [entry({ amount: 2000 })],
      now: NOW,
      lookback: 1,
    });
    expect(r.liquid).toBe(10000);
  });
});
