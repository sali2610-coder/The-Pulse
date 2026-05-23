import { describe, expect, it } from "vitest";

import { buildCardPressure } from "@/lib/card-pressure";
import type {
  Account,
  ExpenseEntry,
  MonthKey,
  RecurringRule,
} from "@/types/finance";

const MONTH: MonthKey = "2026-05";
const NOW = new Date("2026-05-10T08:00:00.000Z");

function card(label: string, last4?: string): Account {
  return {
    id: `card-${label}`,
    kind: "card",
    label,
    active: true,
    cardLast4: last4,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function rule(
  amount: number,
  day: number,
  opts: Partial<RecurringRule> = {},
): RecurringRule {
  return {
    id: `rule-${opts.label ?? "x"}-${day}`,
    label: opts.label ?? "x",
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    keywords: [],
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    ...opts,
  };
}

function entry(amount: number, day: number, last4: string): ExpenseEntry {
  const date = new Date(2026, 4, day).toISOString();
  return {
    id: `e-${day}-${amount}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: "food",
    source: "wallet",
    cardLast4: last4,
    merchant: "test",
    createdAt: date,
  };
}

describe("buildCardPressure", () => {
  it("returns nothing when there are no cards", () => {
    const rows = buildCardPressure({
      accounts: [],
      rules: [],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows).toEqual([]);
  });

  it("sums recurring rules linked to a card", () => {
    const cal = card("CAL", "1234");
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [
        rule(350, 1, {
          label: "Netflix",
          paymentSource: "card",
          linkedCardId: cal.id,
        }),
        rule(120, 8, {
          label: "Spotify",
          paymentSource: "card",
          linkedCardId: cal.id,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].recurringPendingThisMonth).toBe(470);
    expect(rows[0].totalThisMonth).toBe(470);
  });

  it("counts installment plans separately from regular recurring", () => {
    const cal = card("CAL", "1234");
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [
        rule(800, 5, {
          label: "TV",
          paymentSource: "card",
          linkedCardId: cal.id,
          installmentTotal: 12,
          startMonth: 5,
          startYear: 2026,
        }),
        rule(200, 9, {
          label: "Netflix",
          paymentSource: "card",
          linkedCardId: cal.id,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].recurringPendingThisMonth).toBe(200);
    expect(rows[0].installmentThisMonth).toBe(800);
    expect(rows[0].installmentPlansActive).toBe(1);
    expect(rows[0].totalThisMonth).toBe(1000);
  });

  it("matches card-side entries by cardLast4", () => {
    const cal = card("CAL", "1234");
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [],
      entries: [entry(500, 7, "1234"), entry(800, 9, "9999")],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].entriesThisMonth).toBe(500);
  });

  it("skips a rule that's already paid this month", () => {
    const cal = card("CAL", "1234");
    const r = rule(300, 7, {
      label: "Netflix",
      paymentSource: "card",
      linkedCardId: cal.id,
    });
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [r],
      entries: [],
      statuses: [
        { ruleId: r.id, monthKey: MONTH, status: "paid" },
      ],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].recurringPendingThisMonth).toBe(0);
  });

  it("splits fixed vs variable recurring on the breakdown", () => {
    const cal = card("CAL", "1234");
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [
        rule(500, 1, {
          label: "Rent share",
          paymentSource: "card",
          linkedCardId: cal.id,
          // omitted variable → treated as fixed
        }),
        rule(300, 5, {
          label: "Electricity",
          paymentSource: "card",
          linkedCardId: cal.id,
          variable: true,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].fixedRecurringThisMonth).toBe(500);
    expect(rows[0].variableRecurringThisMonth).toBe(300);
    expect(rows[0].recurringPendingThisMonth).toBe(800);
  });

  it("computes monthly burden + remaining frame from creditLimit", () => {
    // Acceptance scenario (Phase 193 / Bug 2):
    //   card creditLimit 10,000
    //   fixed recurring 500 + variable recurring 300 on card
    //   installment plan 5×387 on card (current-month slice 387)
    //   regular one-time card expense 200
    //   → monthly burden 1,387, remaining 8,613
    const cal: Account = {
      id: "card-cal",
      kind: "card",
      label: "CAL",
      active: true,
      cardLast4: "1234",
      creditLimit: 10000,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [
        rule(500, 1, {
          label: "Rent share",
          paymentSource: "card",
          linkedCardId: cal.id,
        }),
        rule(300, 5, {
          label: "Electricity",
          paymentSource: "card",
          linkedCardId: cal.id,
          variable: true,
        }),
        rule(387, 8, {
          label: "TV plan",
          paymentSource: "card",
          linkedCardId: cal.id,
          installmentTotal: 5,
          startMonth: 5,
          startYear: 2026,
        }),
      ],
      entries: [entry(200, 7, "1234")],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].fixedRecurringThisMonth).toBe(500);
    expect(rows[0].variableRecurringThisMonth).toBe(300);
    expect(rows[0].installmentThisMonth).toBe(387);
    expect(rows[0].entriesThisMonth).toBe(200);
    expect(rows[0].totalThisMonth).toBe(1387);
    expect(rows[0].remainingFrame).toBe(8613);
  });

  it("payment source outranks installment grouping", () => {
    // A card-linked installment plan must contribute to THAT card's
    // burden, not be siloed off into a generic installments bucket.
    const cal = card("CAL", "1234");
    const rows = buildCardPressure({
      accounts: [cal],
      rules: [
        rule(400, 5, {
          label: "Plan on card",
          paymentSource: "card",
          linkedCardId: cal.id,
          installmentTotal: 6,
          startMonth: 5,
          startYear: 2026,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    expect(rows[0].installmentThisMonth).toBe(400);
    expect(rows[0].totalThisMonth).toBe(400);
  });

  it("ignores rules linked to a different card", () => {
    const cal = card("CAL", "1234");
    const max = card("MAX", "5678");
    const rows = buildCardPressure({
      accounts: [cal, max],
      rules: [
        rule(100, 5, {
          paymentSource: "card",
          linkedCardId: cal.id,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH,
      now: NOW,
    });
    const calRow = rows.find((r) => r.card.id === cal.id);
    const maxRow = rows.find((r) => r.card.id === max.id);
    expect(calRow?.totalThisMonth).toBe(100);
    expect(maxRow?.totalThisMonth).toBe(0);
  });
});
