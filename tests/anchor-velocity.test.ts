import { describe, expect, it } from "vitest";

import { bankVelocities } from "@/lib/anchor-velocity";
import type { Account, ExpenseEntry } from "@/types/finance";

const NOW = new Date(2026, 4, 28, 12, 0, 0);

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

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
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: daysAgo(5),
    createdAt: daysAgo(5),
    accountId: "b1",
    ...o,
  };
}

describe("bankVelocities", () => {
  it("empty accounts → empty", () => {
    expect(
      bankVelocities({ accounts: [], entries: [], now: NOW }),
    ).toEqual([]);
  });

  it("only banks with anchorBalance set are included", () => {
    const out = bankVelocities({
      accounts: [
        bank({ id: "yes", anchorBalance: 5000 }),
        bank({ id: "no", anchorBalance: undefined }),
      ],
      entries: [],
      now: NOW,
    });
    expect(out.map((v) => v.accountId)).toEqual(["yes"]);
  });

  it("no spend → trend stable + daysToZero Infinity", () => {
    const out = bankVelocities({
      accounts: [bank()],
      entries: [],
      now: NOW,
    });
    expect(out[0].trend).toBe("stable");
    expect(out[0].daysToZero).toBe(Number.POSITIVE_INFINITY);
  });

  it("computes daily / weekly average + daysToZero", () => {
    // 2800 spent in last 28 days → 100/day → anchor 10000 / 100 = 100 days.
    const entries = Array.from({ length: 28 }, (_, i) =>
      entry({ amount: 100, chargeDate: daysAgo(i) }),
    );
    const out = bankVelocities({
      accounts: [bank({ anchorBalance: 10000 })],
      entries,
      now: NOW,
    });
    expect(out[0].dailySpend).toBe(100);
    expect(out[0].weeklySpend).toBe(700);
    expect(out[0].daysToZero).toBe(100);
    expect(out[0].trend).toBe("drain");
  });

  it("excludes entries outside the window", () => {
    const out = bankVelocities({
      accounts: [bank()],
      entries: [
        entry({ amount: 5000, chargeDate: daysAgo(60) }), // outside
        entry({ amount: 700, chargeDate: daysAgo(10) }),  // in
      ],
      now: NOW,
    });
    expect(out[0].dailySpend).toBeCloseTo(25, 5);
  });

  it("excludes refund / pending / non-ILS / no-accountId entries", () => {
    const out = bankVelocities({
      accounts: [bank()],
      entries: [
        entry({ amount: 100, isRefund: true }),
        entry({ amount: 100, needsConfirmation: true }),
        entry({ amount: 100, currency: "USD" }),
        entry({ amount: 100, accountId: undefined }),
        entry({ amount: 100 }),
      ],
      now: NOW,
    });
    expect(out[0].dailySpend).toBeCloseTo(100 / 28, 5);
  });

  it("anchor 0 + spend → daysToZero 0", () => {
    const out = bankVelocities({
      accounts: [bank({ anchorBalance: 0 })],
      entries: [entry({ amount: 100 })],
      now: NOW,
    });
    expect(out[0].daysToZero).toBe(0);
  });
});
