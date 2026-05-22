import { describe, expect, it } from "vitest";

import { emergencyFundReport } from "@/lib/emergency-fund";
import type { Account, ExpenseEntry } from "@/types/finance";

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

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 500,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 3, 10, 12, 0, 0).toISOString(),
    ...o,
  };
}

const NOW = new Date(2026, 4, 15, 12, 0, 0);

describe("emergencyFundReport", () => {
  it("empty inputs → zeros + none rating", () => {
    const r = emergencyFundReport({
      accounts: [],
      entries: [],
      now: NOW,
    });
    expect(r.baselineMonthly).toBe(0);
    expect(r.targetAmount).toBe(0);
    expect(r.currentLiquid).toBe(0);
    expect(r.progress).toBe(0);
    expect(r.rating).toBe("none");
  });

  it("computes baseline from prior 3 months outflow", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 0 })],
      entries: [
        entry({ amount: 1000, chargeDate: new Date(2026, 1, 10).toISOString() }),
        entry({ amount: 2000, chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ amount: 3000, chargeDate: new Date(2026, 3, 10).toISOString() }),
      ],
      now: NOW,
    });
    expect(r.baselineMonthly).toBe(2000); // (1000 + 2000 + 3000) / 3
    expect(r.targetAmount).toBe(6000); // 3 months
  });

  it("excludes negative bank anchors from currentLiquid", () => {
    const r = emergencyFundReport({
      accounts: [
        bank({ id: "good", anchorBalance: 10000 }),
        bank({ id: "ov", anchorBalance: -2000 }),
      ],
      entries: [],
      now: NOW,
    });
    expect(r.currentLiquid).toBe(10000);
  });

  it("progress clamped at 1.0 even when liquid exceeds target", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 100000 })],
      entries: [
        entry({ amount: 1000, chargeDate: new Date(2026, 3, 10).toISOString() }),
      ],
      now: NOW,
    });
    expect(r.progress).toBe(1);
    expect(r.rating).toBe("excellent");
  });

  it("rating bands: low / watch / ok", () => {
    // Single-month lookback → baseline = entry amount. 3000/m, target 9000.
    const e = () =>
      entry({ amount: 3000, chargeDate: new Date(2026, 3, 10).toISOString() });
    const low = emergencyFundReport({
      accounts: [bank({ anchorBalance: 2000 })], // 22% → low
      entries: [e()],
      now: NOW,
      lookback: 1,
    });
    expect(low.rating).toBe("low");
    const watch = emergencyFundReport({
      accounts: [bank({ anchorBalance: 4500 })], // 50% → watch
      entries: [e()],
      now: NOW,
      lookback: 1,
    });
    expect(watch.rating).toBe("watch");
    const ok = emergencyFundReport({
      accounts: [bank({ anchorBalance: 8000 })], // 88% → ok
      entries: [e()],
      now: NOW,
      lookback: 1,
    });
    expect(ok.rating).toBe("ok");
  });

  it("monthsCovered = liquid / baselineMonthly", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 9000 })],
      entries: [
        entry({ amount: 3000, chargeDate: new Date(2026, 3, 10).toISOString() }),
      ],
      now: NOW,
      lookback: 1,
    });
    expect(r.monthsCovered).toBe(3);
  });

  it("monthsCovered = Infinity when baselineMonthly is 0", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 9000 })],
      entries: [],
      now: NOW,
    });
    expect(r.monthsCovered).toBe(Number.POSITIVE_INFINITY);
  });

  it("respects custom lookback + targetMonths", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 0 })],
      entries: [
        entry({ amount: 1000, chargeDate: new Date(2026, 3, 10).toISOString() }),
      ],
      now: NOW,
      lookback: 1,
      targetMonths: 6,
    });
    expect(r.baselineMonthly).toBe(1000);
    expect(r.targetAmount).toBe(6000);
  });

  it("excludes refunds / pending / non-ILS from baseline", () => {
    const r = emergencyFundReport({
      accounts: [bank({ anchorBalance: 0 })],
      entries: [
        entry({
          amount: 5000,
          chargeDate: new Date(2026, 3, 10).toISOString(),
          isRefund: true,
        }),
        entry({
          amount: 5000,
          chargeDate: new Date(2026, 3, 10).toISOString(),
          currency: "USD",
        }),
        entry({
          amount: 1500,
          chargeDate: new Date(2026, 3, 10).toISOString(),
        }),
      ],
      now: NOW,
      lookback: 1,
    });
    expect(r.baselineMonthly).toBe(1500);
  });
});
