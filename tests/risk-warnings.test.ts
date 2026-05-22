import { describe, expect, it } from "vitest";

import { buildRiskWarnings } from "@/lib/risk-warnings";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "b1",
    kind: "bank",
    label: o.label ?? "Discount",
    anchorBalance: o.anchorBalance ?? 5000,
    anchorUpdatedAt: o.anchorUpdatedAt,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "c1",
    kind: "card",
    label: o.label ?? "CAL",
    issuer: "cal",
    cardLast4: "1234",
    billingDay: 25,
    paymentDay: 2,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: "שכר",
    amount: o.amount ?? 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: "rent",
    category: "bills",
    estimatedAmount: o.estimatedAmount ?? 0,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? "l1",
    label: "car",
    monthlyInstallment: o.monthlyInstallment ?? 0,
    dayOfMonth: 5,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

const EMPTY = {
  accounts: [] as Account[],
  loans: [] as Loan[],
  incomes: [] as Income[],
  rules: [] as RecurringRule[],
  entries: [] as ExpenseEntry[],
  statuses: [],
  monthlyBudget: 0,
  monthKey: "2026-05",
  now: new Date(2026, 4, 1, 8, 0, 0),
};

describe("buildRiskWarnings", () => {
  it("empty inputs → no warnings", () => {
    expect(buildRiskWarnings(EMPTY)).toEqual([]);
  });

  it("alerts when end-of-month forecast is negative", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [bank({ anchorBalance: 1000 })],
      loans: [loan({ monthlyInstallment: 5000, dayOfMonth: 15 })],
    });
    expect(out.find((w) => w.id === "forecast_negative")?.severity).toBe(
      "alert",
    );
  });

  it("flags budget consumed when budget eaten but forecast still positive", () => {
    // Set `now` to May 10 so a May 1 entry is unambiguously in the
    // past regardless of host TZ.
    const out = buildRiskWarnings({
      ...EMPTY,
      now: new Date(2026, 4, 10, 12, 0, 0),
      accounts: [bank({ anchorBalance: 50000 })],
      monthlyBudget: 1000,
      entries: [
        {
          id: "e1",
          amount: 1500,
          category: "food",
          source: "manual",
          paymentMethod: "credit",
          installments: 1,
          chargeDate: new Date(2026, 4, 1, 8, 0, 0).toISOString(),
          createdAt: new Date(2026, 4, 1, 8, 0, 0).toISOString(),
        },
      ],
    });
    expect(out.some((w) => w.id === "budget_consumed")).toBe(true);
    expect(out.some((w) => w.id === "forecast_negative")).toBe(false);
  });

  it("alerts high card pressure when > 80% of income", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [card()],
      incomes: [income({ amount: 10000 })],
      rules: [
        rule({
          id: "r1",
          estimatedAmount: 9000,
          paymentSource: "card",
          linkedCardId: "c1",
        }),
      ],
    });
    const hit = out.find((w) => w.id.startsWith("card_high_pressure:"));
    expect(hit?.severity).toBe("alert");
  });

  it("warns mid-pressure card (50-79% of income)", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [card()],
      incomes: [income({ amount: 10000 })],
      rules: [
        rule({
          id: "r1",
          estimatedAmount: 5500,
          paymentSource: "card",
          linkedCardId: "c1",
        }),
      ],
    });
    const hit = out.find((w) => w.id.startsWith("card_high_pressure:"));
    expect(hit?.severity).toBe("warn");
  });

  it("flags fixed-cost ratio in the watch band (55-69%)", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [bank({ anchorBalance: 50000 })],
      incomes: [income({ amount: 10000, dayOfMonth: 30 })],
      rules: [rule({ estimatedAmount: 6000 })], // 60% of income
    });
    expect(
      out.find((w) => w.id === "fixed_cost_ratio_watch")?.severity,
    ).toBe("watch");
  });

  it("alerts when fixed-cost ratio >= 90%", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [bank({ anchorBalance: 50000 })],
      incomes: [income({ amount: 10000, dayOfMonth: 30 })],
      rules: [rule({ estimatedAmount: 9500 })], // 95%
    });
    expect(
      out.find((w) => w.id === "fixed_cost_ratio_high")?.severity,
    ).toBe("alert");
  });

  it("watches stale anchor over 14 days old", () => {
    const stale = new Date(2026, 3, 1, 0, 0, 0); // 30 days before now=2026-05-01
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [
        bank({
          id: "b1",
          anchorBalance: 5000,
          anchorUpdatedAt: stale.toISOString(),
        }),
      ],
    });
    expect(out.find((w) => w.id === "stale_anchor:b1")?.severity).toBe(
      "watch",
    );
  });

  it("sorts alert > warn > watch", () => {
    const out = buildRiskWarnings({
      ...EMPTY,
      accounts: [
        bank({ anchorBalance: 100 }), // tiny → forecast may go red
        card(),
      ],
      incomes: [income({ amount: 10000 })],
      rules: [
        rule({
          id: "r1",
          estimatedAmount: 9000, // 90% income — alert
          paymentSource: "card",
          linkedCardId: "c1",
        }),
      ],
    });
    // Highest severity first.
    expect(out[0].severity).toBe("alert");
  });
});
