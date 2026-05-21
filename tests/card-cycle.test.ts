import { describe, expect, it } from "vitest";

import {
  currentCardCycle,
  projectCardCycle,
} from "@/lib/card-cycle";
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

describe("currentCardCycle", () => {
  it("returns undefined for non-card accounts", () => {
    const bank = card({ kind: "bank" });
    expect(currentCardCycle(bank, new Date())).toBeUndefined();
  });

  it("returns undefined for cards without billingDay", () => {
    const c = card({ billingDay: undefined });
    expect(currentCardCycle(c, new Date())).toBeUndefined();
  });

  it("computes the current cycle when today is before billingDay", () => {
    // Today: May 20. billingDay 25 → cycle Apr 26 – May 25.
    const now = new Date(2026, 4, 20, 12, 0);
    const cycle = currentCardCycle(card(), now)!;
    expect(cycle.cycleStart.getMonth()).toBe(3); // April
    expect(cycle.cycleStart.getDate()).toBe(26);
    expect(cycle.cycleEnd.getMonth()).toBe(4); // May
    expect(cycle.cycleEnd.getDate()).toBe(25);
  });

  it("rolls to next cycle when today is past billingDay", () => {
    // Today: May 26. billingDay 25 → cycle May 26 – June 25.
    const now = new Date(2026, 4, 26, 12, 0);
    const cycle = currentCardCycle(card(), now)!;
    expect(cycle.cycleStart.getMonth()).toBe(4); // May
    expect(cycle.cycleStart.getDate()).toBe(26);
    expect(cycle.cycleEnd.getMonth()).toBe(5); // June
    expect(cycle.cycleEnd.getDate()).toBe(25);
  });

  it("clamps a 31-day billingDay to end-of-February", () => {
    const now = new Date(2026, 1, 10); // Feb 10 2026 (28 days)
    const cycle = currentCardCycle(card({ billingDay: 31 }), now)!;
    // Feb has 28 days, so cycleEnd should be Feb 28.
    expect(cycle.cycleEnd.getMonth()).toBe(1);
    expect(cycle.cycleEnd.getDate()).toBe(28);
  });
});

describe("projectCardCycle", () => {
  it("sums entries whose chargeDate falls inside the cycle", () => {
    const now = new Date(2026, 4, 20);
    const entries = [
      entry({
        chargeDate: new Date(2026, 4, 10).toISOString(),
        amount: 200,
      }),
      entry({
        chargeDate: new Date(2026, 3, 27).toISOString(),
        amount: 50,
      }),
      // Outside cycle (before Apr 26).
      entry({
        chargeDate: new Date(2026, 3, 20).toISOString(),
        amount: 999,
      }),
    ];
    const projection = projectCardCycle({ account: card(), entries, now })!;
    expect(projection.projectedAmount).toBe(250);
    expect(projection.entryCount).toBe(2);
  });

  it("ignores entries belonging to other cards", () => {
    const now = new Date(2026, 4, 20);
    const entries = [
      entry({ accountId: "other-card", amount: 500 }),
      entry({ accountId: "card-1", amount: 100 }),
    ];
    const projection = projectCardCycle({ account: card(), entries, now })!;
    expect(projection.projectedAmount).toBe(100);
  });

  it("ignores refunds + excluded + pending + needsConfirmation", () => {
    const now = new Date(2026, 4, 20);
    const entries = [
      entry({ amount: 100, isRefund: true }),
      entry({ amount: 100, excludeFromBudget: true }),
      entry({ amount: 100, bankPending: true }),
      entry({ amount: 100, needsConfirmation: true }),
      entry({ amount: 100 }),
    ];
    const projection = projectCardCycle({ account: card(), entries, now })!;
    expect(projection.projectedAmount).toBe(100);
    expect(projection.entryCount).toBe(1);
  });

  it("computes days until close + payment date in next month", () => {
    // May 20 → close May 25 → 5 days until close. Payment June 2.
    const now = new Date(2026, 4, 20, 12, 0);
    const projection = projectCardCycle({
      account: card(),
      entries: [],
      now,
    })!;
    // Ceil from "May 20 noon → May 25 EOD" = 6.
    expect(projection.daysUntilClose).toBe(6);
    expect(projection.paymentDate?.getMonth()).toBe(5);
    expect(projection.paymentDate?.getDate()).toBe(2);
  });

  it("includes an installment slice when the cycle window captures it", () => {
    const now = new Date(2026, 4, 20);
    const longPlan = entry({
      amount: 1200,
      installments: 12,
      chargeDate: new Date(2026, 0, 10).toISOString(),
    });
    const projection = projectCardCycle({
      account: card(),
      entries: [longPlan],
      now,
    })!;
    // May slice = 100 (1200 / 12). The cycle Apr 26–May 25 contains
    // the May 10 slice, but does not double-count.
    expect(projection.projectedAmount).toBe(100);
    expect(projection.entryCount).toBe(1);
  });
});
