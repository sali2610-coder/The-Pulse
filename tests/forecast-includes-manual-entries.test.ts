// Phase 390 — manual credit entries must reach the Time forecast.
//
// User report: "Manual daily expenses appear in one container but
// are missing from Time forecast / future movements." This test
// walks the same path the Time screen uses (liquidityCurve) and
// asserts that a manual credit entry is reflected in the projected
// bank balance at the card's billing cursor.

import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const NOW = new Date(2026, 5, 5, 12, 0, 0); // June 5

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 10_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-1",
    kind: "card",
    label: "Visa",
    cardLast4: "1234",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function manualCreditEntry(
  o: Partial<ExpenseEntry> = {},
): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 2_266,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 5, 6, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 5, 6, 18, 0, 0).toISOString(),
    ...o,
  };
}

describe("Phase 390 — liquidityCurve deducts manual credit entries on the card billing day", () => {
  it("at the next card payment day (July 2), the balance reflects the manual entry", () => {
    const accounts = [bank({ anchorBalance: 10_000 }), card()];
    const entries: ExpenseEntry[] = [manualCreditEntry({ amount: 2_266 })];
    const curve = liquidityCurve({
      accounts,
      loans: [] as Loan[],
      incomes: [] as Income[],
      rules: [] as RecurringRule[],
      statuses: [] as RecurringStatus[],
      entries,
      now: NOW,
      windowDays: 45,
    });
    // Anchor balance on day 0 — no events yet.
    const startBalance = curve.points[0].balance;
    expect(startBalance).toBe(10_000);

    // Card payment day is 2nd of July → 27 days from June 5.
    const julyTwoIdx = curve.points.findIndex(
      (p) => new Date(p.whenISO).getDate() === 2 &&
        new Date(p.whenISO).getMonth() === 6,
    );
    expect(julyTwoIdx).toBeGreaterThan(0);

    // Balance at July 2 must reflect the 2,266 deduction. Allow a
    // tiny float epsilon; we don't care about cents here.
    const julyTwoBalance = curve.points[julyTwoIdx].balance;
    expect(julyTwoBalance).toBeLessThanOrEqual(10_000 - 2_266 + 1);
    expect(julyTwoBalance).toBeGreaterThanOrEqual(10_000 - 2_266 - 1);
  });

  it("with NO card account, manual credit entry STILL deducts on the curve (Phase 388 fallback)", () => {
    const accounts = [bank({ anchorBalance: 10_000 })]; // no card
    const entries: ExpenseEntry[] = [manualCreditEntry({ amount: 1_500 })];
    const curve = liquidityCurve({
      accounts,
      loans: [] as Loan[],
      incomes: [] as Income[],
      rules: [] as RecurringRule[],
      statuses: [] as RecurringStatus[],
      entries,
      now: NOW,
      windowDays: 45,
    });
    // Lowest point in the window must dip ~1,500 below the anchor
    // (effective cash date defaults to the synthetic card payment
    // day inside the window).
    const lowest = curve.lowestPoint.balance;
    expect(lowest).toBeLessThanOrEqual(10_000 - 1_500 + 1);
  });

  it("pending entry is NOT deducted from the curve (intentional)", () => {
    const accounts = [bank({ anchorBalance: 10_000 }), card()];
    const entries: ExpenseEntry[] = [
      manualCreditEntry({
        id: "e-pending",
        amount: 800,
        needsConfirmation: true,
      }),
    ];
    const curve = liquidityCurve({
      accounts,
      loans: [] as Loan[],
      incomes: [] as Income[],
      rules: [] as RecurringRule[],
      statuses: [] as RecurringStatus[],
      entries,
      now: NOW,
      windowDays: 45,
    });
    const lowest = curve.lowestPoint.balance;
    expect(lowest).toBeGreaterThanOrEqual(10_000 - 1);
  });

  it("wallet + sms + imported credit entries all deduct on the curve", () => {
    const accounts = [bank({ anchorBalance: 10_000 }), card()];
    const entries: ExpenseEntry[] = [
      manualCreditEntry({ id: "e-wallet", source: "wallet", amount: 500 }),
      manualCreditEntry({ id: "e-sms", source: "sms", amount: 300 }),
      manualCreditEntry({
        id: "e-csv",
        source: "auto",
        externalId: "import:cal:2026-06-04:200:Shufersal",
        amount: 200,
      }),
    ];
    const curve = liquidityCurve({
      accounts,
      loans: [] as Loan[],
      incomes: [] as Income[],
      rules: [] as RecurringRule[],
      statuses: [] as RecurringStatus[],
      entries,
      now: NOW,
      windowDays: 45,
    });
    const julyTwoIdx = curve.points.findIndex(
      (p) =>
        new Date(p.whenISO).getDate() === 2 &&
        new Date(p.whenISO).getMonth() === 6,
    );
    const julyTwoBalance = curve.points[julyTwoIdx].balance;
    expect(julyTwoBalance).toBeLessThanOrEqual(10_000 - 1_000 + 1);
  });
});
