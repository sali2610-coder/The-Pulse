import { describe, expect, it } from "vitest";

import {
  effectiveCashImpactStream,
  effectiveCashImpacts,
  remainingCashImpacts,
} from "@/lib/effective-cash-date";
import type { Account, ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

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

function card(opts: Partial<Account> & { id: string }): Account {
  return {
    kind: "card",
    label: opts.label ?? opts.id,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...opts,
  };
}

describe("effectiveCashImpacts — cash path", () => {
  it("cash charge lands on its own date", () => {
    const e = entry({ amount: 100, iso: "2026-05-02T10:00:00Z", paymentMethod: "cash" });
    const impacts = effectiveCashImpacts({ entry: e, accounts: [] });
    expect(impacts).toHaveLength(1);
    expect(impacts[0].kind).toBe("cash");
    expect(impacts[0].effectiveCashDate.getTime()).toBe(
      impacts[0].purchaseDate.getTime(),
    );
  });
});

describe("effectiveCashImpacts — credit card path", () => {
  it("purchase on the 2nd settles on this month's payment day (10)", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    const e = entry({
      amount: 200,
      iso: "2026-05-02T10:00:00Z",
      cardLast4: "1234",
    });
    const impacts = effectiveCashImpacts({ entry: e, accounts: [c] });
    expect(impacts).toHaveLength(1);
    expect(impacts[0].kind).toBe("card");
    expect(impacts[0].effectiveCashDate.getDate()).toBe(10);
    expect(impacts[0].effectiveCashDate.getMonth()).toBe(4); // May
    expect(impacts[0].viaCardId).toBe("cal");
  });

  it("purchase on the 18th rolls to next month's payment day", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    const e = entry({
      amount: 500,
      iso: "2026-05-18T10:00:00Z",
      cardLast4: "1234",
    });
    const impacts = effectiveCashImpacts({ entry: e, accounts: [c] });
    expect(impacts[0].effectiveCashDate.getMonth()).toBe(5); // June
    expect(impacts[0].effectiveCashDate.getDate()).toBe(10);
  });

  it("12-installment plan walks forward by month, each slice on payment day", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    const e = entry({
      amount: 1200,
      installments: 12,
      iso: "2026-05-02T10:00:00Z",
      cardLast4: "1234",
    });
    const impacts = effectiveCashImpacts({ entry: e, accounts: [c] });
    expect(impacts).toHaveLength(12);
    // Each slice ₪100.
    for (const i of impacts) expect(i.amount).toBe(100);
    // All slices on the 10th.
    for (const i of impacts) {
      expect(i.effectiveCashDate.getDate()).toBe(10);
    }
    // Month progression: 4..15 (mod 12).
    const months = impacts.map((i) =>
      i.effectiveCashDate.getMonth() + i.effectiveCashDate.getFullYear() * 12,
    );
    for (let k = 1; k < months.length; k++) {
      expect(months[k]).toBe(months[k - 1] + 1);
    }
  });

  it("falls back to default day 10 when card has no paymentDay/billingDay", () => {
    const c = card({ id: "cal", cardLast4: "1234" });
    const e = entry({
      amount: 100,
      iso: "2026-05-02T10:00:00Z",
      cardLast4: "1234",
    });
    const impacts = effectiveCashImpacts({ entry: e, accounts: [c] });
    expect(impacts[0].effectiveCashDate.getDate()).toBe(10);
  });

  it("skips refunded / pending / excluded entries entirely", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    for (const flag of ["isRefund", "needsConfirmation", "bankPending", "excludeFromBudget"] as const) {
      const e = entry({
        amount: 100,
        iso: "2026-05-02T10:00:00Z",
        cardLast4: "1234",
        [flag]: true,
      });
      expect(effectiveCashImpacts({ entry: e, accounts: [c] })).toEqual([]);
    }
  });
});

describe("effectiveCashImpactStream", () => {
  it("flattens many entries sorted by effective-cash-date", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    const a = entry({
      amount: 100,
      iso: "2026-05-18T10:00:00Z",
      cardLast4: "1234",
    });
    const b = entry({
      amount: 200,
      iso: "2026-05-02T10:00:00Z",
      cardLast4: "1234",
    });
    const stream = effectiveCashImpactStream({
      entries: [a, b],
      accounts: [c],
    });
    expect(stream).toHaveLength(2);
    expect(stream[0].effectiveCashDate.getTime()).toBeLessThan(
      stream[1].effectiveCashDate.getTime(),
    );
  });
});

describe("remainingCashImpacts", () => {
  it("only returns impacts after now", () => {
    const c = card({ id: "cal", paymentDay: 10, cardLast4: "1234" });
    const e = entry({
      amount: 100,
      iso: "2026-04-02T10:00:00Z", // settles 2026-04-10
      cardLast4: "1234",
    });
    expect(
      remainingCashImpacts({ entry: e, accounts: [c], now: NOW }),
    ).toHaveLength(0);
  });
});
