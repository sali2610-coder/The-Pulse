// Phase 371 — snapshot card-settled rule undercount regression.
//
// Audit found buildFinancialSnapshot was filtering out card-settled
// rules whose nominal dayOfMonth had already passed in the current
// month (line 202). Card-settled rules don't bill on dayOfMonth —
// they bill on the card's billing day. They must still appear in
// recurringCommitmentsUntilNextMonth.

import { describe, expect, it } from "vitest";

import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

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
    label: "MAX",
    cardLast4: "1234",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

const NOW = new Date(2026, 5, 20, 12, 0, 0); // June 20 — past day 10
const MONTH_KEY = "2026-06" as const;

const BASE = {
  accounts: [bank(), card()],
  loans: [] as Loan[],
  incomes: [] as Income[],
  entries: [] as ExpenseEntry[],
  statuses: [] as RecurringStatus[],
  monthlyBudget: 0,
};

describe("Phase 371 — card-settled rule survives past-day gate", () => {
  it("card-settled rule dayOfMonth=10 on day 20 STILL appears in card commitments", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          id: "r-card",
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          dayOfMonth: 10, // already passed (now = day 20)
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
      ],
      now: NOW,
      monthKey: MONTH_KEY,
    });
    // Pre-fix this would have been 0 because the rule was silently
    // dropped at the dayOfMonth<today gate.
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(540);
    // The card rule does NOT leak into bank-fixed lane.
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
  });

  it("legacy linkedCardId-only rule also survives the gate", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          id: "r-legacy",
          label: "ארנונה ישנה",
          estimatedAmount: 320,
          dayOfMonth: 5,
          linkedCardId: "card-1",
        }),
      ],
      now: NOW,
      monthKey: MONTH_KEY,
    });
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(320);
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
  });

  it("bank rule with dayOfMonth<today is still dropped (no regression)", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          id: "r-bank-past",
          label: "ארנונה",
          estimatedAmount: 800,
          dayOfMonth: 5, // past
          paymentSource: "bank",
        }),
      ],
      now: NOW,
      monthKey: MONTH_KEY,
    });
    // Bank rules whose day has passed are intentionally dropped from
    // the future projection — they've already been debited.
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
  });

  it("bank rule with future dayOfMonth still counts", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          id: "r-bank-fut",
          label: "מים",
          estimatedAmount: 200,
          dayOfMonth: 25, // future
          paymentSource: "bank",
        }),
      ],
      now: NOW,
      monthKey: MONTH_KEY,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(200);
  });
});
