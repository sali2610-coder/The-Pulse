import { describe, expect, it } from "vitest";

import { accountBridge } from "@/lib/account-bridge";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

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

// kept for future tests; underscore prevents unused-var lint
function _card(id: string, last4: string, limit?: number): Account {
  return {
    id,
    kind: "card",
    label: id,
    active: true,
    cardLast4: last4,
    creditLimit: limit,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
void _card;

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

function rule(opts: Partial<RecurringRule> & { id: string }): RecurringRule {
  return {
    label: "rule",
    category: "bills",
    estimatedAmount: 500,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function loan(opts: Partial<Loan> & { id: string }): Loan {
  return {
    label: "loan",
    monthlyInstallment: 500,
    dayOfMonth: 5,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function income(opts: Partial<Income> & { id: string }): Income {
  return {
    label: "salary",
    amount: 10000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

describe("accountBridge", () => {
  it("computes a zero shell on empty input", () => {
    const b = accountBridge({
      accounts: [],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(b.currentBankBalance).toBe(0);
    expect(b.spentThisMonth).toBe(0);
    expect(b.pendingObligationsTotal).toBe(0);
    expect(b.expectedBalanceAfterAllObligations).toBe(0);
  });

  it("currentBankBalance sums active anchors", () => {
    const b = accountBridge({
      accounts: [bank("a", 12000), bank("b", -1500)],
      loans: [],
      incomes: [],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(b.currentBankBalance).toBe(10500);
  });

  it("spent this month excludes anchors / loans / income / refunds", () => {
    const b = accountBridge({
      accounts: [bank("a", 5000)],
      loans: [loan({ id: "l", monthlyInstallment: 999 })],
      incomes: [income({ id: "s", amount: 9999 })],
      entries: [
        entry({ amount: 200, iso: "2026-05-05T10:00:00Z" }),
        entry({ amount: 50, iso: "2026-05-06T10:00:00Z", isRefund: true }),
      ],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(b.spentThisMonth).toBe(200);
    expect(b.refundCreditThisMonth).toBe(50);
  });

  it("expected balance = anchors + future income − pending obligations", () => {
    const b = accountBridge({
      accounts: [bank("a", 10000)],
      loans: [loan({ id: "l", dayOfMonth: 28, monthlyInstallment: 1000 })],
      incomes: [income({ id: "s", dayOfMonth: 25, amount: 8000 })],
      entries: [],
      rules: [rule({ id: "r", dayOfMonth: 28, estimatedAmount: 500 })],
      statuses: [],
      now: NOW,
    });
    // 10000 + 8000 − 500 − 1000 − 0 = 16500
    expect(b.expectedBalanceAfterAllObligations).toBe(16500);
  });

  it("does NOT double-count installment plans paid via card", () => {
    // The future-card-slices term in forecastEndOfMonth covers each
    // installment slice once. A linked recurring rule is a SEPARATE
    // concept (subscription) and contributes to pendingFixed once.
    //
    // Phase 213 effective-cash lens: card paymentDay must come AFTER
    // both source dates so the impact still lands in May (otherwise
    // the engine correctly rolls to June and counts 0 this month).
    const cardAcct: Account = {
      id: "card-cal",
      kind: "card",
      label: "card-cal",
      active: true,
      cardLast4: "1234",
      paymentDay: 30,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const installment = entry({
      amount: 1200,
      iso: "2026-05-25T10:00:00Z",
      installments: 12,
      cardLast4: "1234",
    });
    const sub = rule({
      id: "rule-sub",
      label: "Netflix",
      dayOfMonth: 27,
      estimatedAmount: 60,
      paymentSource: "card",
      linkedCardId: cardAcct.id,
    });
    const b = accountBridge({
      accounts: [bank("a", 5000), cardAcct],
      loans: [],
      incomes: [],
      entries: [installment],
      rules: [sub],
      statuses: [],
      now: NOW,
    });
    // pendingFixed = 60 (Netflix), pendingCardCharges = 100 (slice).
    // Total obligations = 160. Not 1260 — installment is counted as
    // slice not as full plan.
    expect(b.pendingFixed).toBe(60);
    expect(b.pendingCardCharges).toBe(100);
    expect(b.pendingObligationsTotal).toBe(160);
  });

  it("future obligations include charges scheduled later this month", () => {
    // Phase 213 — entry routes through the linked card's paymentDay.
    // Card paymentDay 30 keeps the May-28 purchase landing in May
    // (settles May 30) so the charge contributes to this month.
    const cardAcct: Account = {
      id: "card-late",
      kind: "card",
      label: "card-late",
      active: true,
      cardLast4: "1234",
      paymentDay: 30,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const b = accountBridge({
      accounts: [bank("a", 1000), cardAcct],
      loans: [],
      incomes: [],
      entries: [
        entry({
          amount: 800,
          iso: "2026-05-28T10:00:00Z",
          cardLast4: "1234",
        }),
      ],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(b.pendingCardCharges).toBe(800);
    expect(b.expectedBalanceAfterAllObligations).toBe(200);
  });
});
