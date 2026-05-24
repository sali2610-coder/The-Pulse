// Phase 213 — verifies the new useEffectiveCashDates branch on
// forecastEndOfMonth.

import { describe, expect, it } from "vitest";

import { forecastEndOfMonth } from "@/lib/forecast";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function bank(id: string, anchor: number): Account {
  return {
    id,
    kind: "bank",
    label: id,
    active: true,
    anchorBalance: anchor,
    anchorUpdatedAt: NOW.toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function card(opts: Partial<Account> & { id: string }): Account {
  return {
    kind: "card",
    label: opts.label ?? opts.id,
    active: true,
    cardLast4: "1234",
    paymentDay: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function rule(opts: Partial<RecurringRule> & { id: string }): RecurringRule {
  return {
    label: "rule",
    category: "bills",
    estimatedAmount: 500,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: `e-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
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

describe("forecastEndOfMonth — useEffectiveCashDates branch", () => {
  it("default branch unchanged when flag omitted", () => {
    const r = forecastEndOfMonth({
      accounts: [bank("a", 10000)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
    });
    expect(r.totalAnchors).toBe(10000);
    expect(r.pendingFixed).toBe(0);
    expect(r.futureCardSlices).toBe(0);
  });

  it("rule linked to card with paymentDay outside the month does NOT count this month", () => {
    // Insurance rule says day 1, linked to card paying on day 24 of
    // current month → still May → counts. Now flip card paymentDay
    // to day 5: rule "day 1" with paymentDay 5 settles on May 5
    // (still May) → still counts. To force out: use rule day 28 +
    // paymentDay 10. Then card-pay rolls to June 10 → outside May.
    const cal = card({ id: "cal", paymentDay: 10 });
    const r = forecastEndOfMonth({
      accounts: [bank("a", 10000), cal],
      loans: [],
      incomes: [],
      entries: [],
      rules: [
        rule({
          id: "ins",
          label: "Insurance",
          dayOfMonth: 28,
          paymentSource: "card",
          linkedCardId: "cal",
          estimatedAmount: 800,
        }),
      ],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
      useEffectiveCashDates: true,
    });
    expect(r.pendingFixed).toBe(0);
  });

  it("rule linked to card with paymentDay inside the month DOES count", () => {
    const cal = card({ id: "cal", paymentDay: 24 });
    const r = forecastEndOfMonth({
      accounts: [bank("a", 10000), cal],
      loans: [],
      incomes: [],
      entries: [],
      rules: [
        rule({
          id: "ins",
          label: "Insurance",
          dayOfMonth: 1,
          paymentSource: "card",
          linkedCardId: "cal",
          estimatedAmount: 800,
        }),
      ],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
      useEffectiveCashDates: true,
    });
    expect(r.pendingFixed).toBe(800);
  });

  it("entry purchased late-month on card paying next month does NOT subtract from current month", () => {
    const cal = card({ id: "cal", paymentDay: 10 });
    const e = entry({
      amount: 500,
      iso: "2026-05-18T10:00:00Z", // settles June 10
      cardLast4: "1234",
    });
    const r = forecastEndOfMonth({
      accounts: [bank("a", 10000), cal],
      loans: [],
      incomes: [],
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
      now: NOW,
      useEffectiveCashDates: true,
    });
    expect(r.futureCardSlices).toBe(0);
  });

  it("same entry IS counted when monthKey advances to June", () => {
    const cal = card({ id: "cal", paymentDay: 10 });
    const e = entry({
      amount: 500,
      iso: "2026-05-18T10:00:00Z",
      cardLast4: "1234",
    });
    const r = forecastEndOfMonth({
      accounts: [bank("a", 10000), cal],
      loans: [],
      incomes: [],
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-06",
      now: NOW,
      useEffectiveCashDates: true,
    });
    expect(r.futureCardSlices).toBe(500);
  });
});
