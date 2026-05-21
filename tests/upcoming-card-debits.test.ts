import { describe, expect, it } from "vitest";

import {
  nextCardDebit,
  upcomingCardDebits,
} from "@/lib/upcoming-card-debits";
import type { Account, ExpenseEntry } from "@/types/finance";

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: "card-1",
    kind: "card",
    label: "CAL",
    issuer: "cal",
    cardLast4: "1234",
    billingDay: 25,
    paymentDay: 2,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "sms",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10).toISOString(),
    createdAt: new Date(2026, 4, 10).toISOString(),
    accountId: "card-1",
    ...overrides,
  };
}

describe("nextCardDebit", () => {
  it("returns undefined when paymentDay is missing", () => {
    expect(
      nextCardDebit({
        account: card({ paymentDay: undefined }),
        entries: [],
      }),
    ).toBeUndefined();
  });

  it("settles a debit when billing > payment in the same month (paymentDay 2, billingDay 25)", () => {
    // May 28 — next paymentDay June 2. Cycle settled = May 25 (billing
    // came before June 2 in June). Wait — same month logic: in June,
    // billingDay 25 > paymentDay 2 → settling cycle ends May 25.
    const now = new Date(2026, 4, 28, 12, 0);
    const debit = nextCardDebit({
      account: card(),
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 10).toISOString(),
          amount: 200,
        }),
        entry({
          chargeDate: new Date(2026, 3, 28).toISOString(),
          amount: 50,
        }),
        // Outside window — June 1 (after May 25 close).
        entry({
          chargeDate: new Date(2026, 5, 1).toISOString(),
          amount: 999,
        }),
      ],
      now,
    })!;
    expect(debit.paymentDate.getMonth()).toBe(5);
    expect(debit.paymentDate.getDate()).toBe(2);
    expect(debit.cycleEnd.getMonth()).toBe(4);
    expect(debit.cycleEnd.getDate()).toBe(25);
    expect(debit.projectedAmount).toBe(250);
    expect(debit.daysUntil).toBe(5);
  });

  it("returns the current-month payment when today <= paymentDay", () => {
    // May 1 → paymentDate May 2.
    const now = new Date(2026, 4, 1, 12, 0);
    const debit = nextCardDebit({
      account: card(),
      entries: [],
      now,
    })!;
    expect(debit.paymentDate.getMonth()).toBe(4);
    expect(debit.paymentDate.getDate()).toBe(2);
  });

  it("settles same-month cycle when billing < payment (billingDay 5, paymentDay 25)", () => {
    // billingDay 5, paymentDay 25. Today May 20 → next paymentDate
    // May 25. Settling cycle closed May 5 (same month).
    const now = new Date(2026, 4, 20);
    const debit = nextCardDebit({
      account: card({ billingDay: 5, paymentDay: 25 }),
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 3).toISOString(),
          amount: 100,
        }),
      ],
      now,
    })!;
    expect(debit.cycleEnd.getMonth()).toBe(4);
    expect(debit.cycleEnd.getDate()).toBe(5);
    expect(debit.projectedAmount).toBe(100);
  });

  it("excludes refunds + pending + needsConfirmation + excludeFromBudget", () => {
    const now = new Date(2026, 4, 20);
    const debit = nextCardDebit({
      account: card(),
      entries: [
        entry({ amount: 100, isRefund: true }),
        entry({ amount: 100, bankPending: true }),
        entry({ amount: 100, needsConfirmation: true }),
        entry({ amount: 100, excludeFromBudget: true }),
        entry({ amount: 100 }),
      ],
      now,
    })!;
    expect(debit.projectedAmount).toBe(100);
    expect(debit.entryCount).toBe(1);
  });
});

describe("upcomingCardDebits", () => {
  it("filters to debits within the horizon", () => {
    const now = new Date(2026, 4, 28);
    const a = card({ id: "near", paymentDay: 2, billingDay: 25 });
    const b = card({
      id: "far",
      paymentDay: 28,
      billingDay: 5,
    });
    const debits = upcomingCardDebits({
      accounts: [a, b],
      entries: [
        entry({
          accountId: "near",
          chargeDate: new Date(2026, 4, 10).toISOString(),
          amount: 200,
        }),
        entry({
          accountId: "far",
          chargeDate: new Date(2026, 4, 10).toISOString(),
          amount: 200,
        }),
      ],
      now,
      horizonDays: 7,
    });
    expect(debits).toHaveLength(1);
    expect(debits[0].accountId).toBe("near");
  });

  it("drops zero-projection debits", () => {
    const now = new Date(2026, 4, 28);
    expect(
      upcomingCardDebits({
        accounts: [card()],
        entries: [],
        now,
        horizonDays: 7,
      }),
    ).toHaveLength(0);
  });
});
