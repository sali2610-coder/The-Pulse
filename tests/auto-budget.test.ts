import { describe, expect, it } from "vitest";

import {
  autoBudget,
  effectiveMonthlyBudget,
} from "@/lib/auto-budget";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
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

function income(opts: Partial<Income> & { id: string }): Income {
  return {
    label: "salary",
    amount: 13000,
    dayOfMonth: 1,
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

describe("autoBudget", () => {
  it("returns zero spendable + danger vibe when projection crosses zero", () => {
    // Brief scenario: balance -5000, salary +13000 (after horizon),
    // card -7000, loans -2150, fixed -500 → lowest stays negative.
    const c = card({ id: "cal", paymentDay: 20 });
    const big = entry({
      amount: 7000,
      iso: "2026-05-02T10:00:00Z", // settles May 20 via card
      cardLast4: "1234",
    });
    const r = autoBudget({
      accounts: [bank("a", -5000), c],
      loans: [loan({ id: "l", monthlyInstallment: 2150, dayOfMonth: 22 })],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      entries: [big],
      rules: [rule({ id: "fix", estimatedAmount: 500, dayOfMonth: 21, paymentSource: "bank" })],
      statuses: [],
      now: NOW,
    });
    expect(r.spendableUntilCycleEnd).toBe(0);
    expect(r.vibe).toBe("danger");
    expect(r.willCrossZero).toBe(true);
  });

  it("returns positive spendable when surplus exists", () => {
    const r = autoBudget({
      accounts: [bank("a", 50000)],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(r.spendableUntilCycleEnd).toBeGreaterThan(0);
    expect(r.vibe).toBe("calm");
  });

  it("safety buffer trims spendable + can tip vibe to danger", () => {
    const without = autoBudget({
      accounts: [bank("a", 1000)],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    const withBuf = autoBudget({
      accounts: [bank("a", 1000)],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
      safetyBuffer: 800,
    });
    expect(withBuf.spendableUntilCycleEnd).toBe(
      without.spendableUntilCycleEnd - 800,
    );
    expect(withBuf.safetyBufferApplied).toBe(800);
  });

  it("cycleEnd lands the day BEFORE next salary", () => {
    const r = autoBudget({
      accounts: [bank("a", 5000)],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 25 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    expect(r.cycleEndAt.startsWith("2026-05-24")).toBe(true);
  });

  it("card-linked rule lands on card paymentDay (no double-count)", () => {
    // Rule says day 1, linked to card paying on the 24th → cash hit
    // is on day 24, not on day 1. Verifies the no-double-count rule
    // by checking only ONE obligation contributes (not the rule + a
    // separate card slice).
    const c = card({ id: "cal", paymentDay: 24 });
    const ruleOnCard = rule({
      id: "ins",
      label: "Insurance",
      dayOfMonth: 1,
      paymentSource: "card",
      linkedCardId: "cal",
      estimatedAmount: 800,
    });
    const r = autoBudget({
      accounts: [bank("a", 10000), c],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 28 })],
      entries: [],
      rules: [ruleOnCard],
      statuses: [],
      now: NOW,
    });
    // lowest = 10000 - 800 = 9200 (only one debit hits before salary).
    expect(r.lowestProjectedBalance).toBe(9200);
  });

  it("two cards produce two settlement contributions", () => {
    const cal = card({ id: "cal", paymentDay: 24, cardLast4: "1111" });
    const max = card({ id: "max", paymentDay: 28, cardLast4: "2222" });
    const r = autoBudget({
      accounts: [bank("a", 10000), cal, max],
      loans: [],
      incomes: [income({ id: "s", amount: 13000, dayOfMonth: 30 })],
      entries: [
        entry({
          amount: 1500,
          iso: "2026-05-02T10:00:00Z",
          cardLast4: "1111",
        }),
        entry({
          amount: 2000,
          iso: "2026-05-02T10:00:00Z",
          cardLast4: "2222",
        }),
      ],
      rules: [],
      statuses: [],
      now: NOW,
    });
    // Lowest after both settle = 10000 - 1500 - 2000 = 6500.
    expect(r.lowestProjectedBalance).toBe(6500);
  });
});

describe("effectiveMonthlyBudget", () => {
  it("manual mode returns user value", () => {
    expect(
      effectiveMonthlyBudget({
        monthlyBudget: 5000,
        budgetMode: "manual",
        autoReport: null,
      }),
    ).toBe(5000);
  });

  it("auto mode without report falls back to manual value", () => {
    expect(
      effectiveMonthlyBudget({
        monthlyBudget: 5000,
        budgetMode: "auto",
        autoReport: null,
      }),
    ).toBe(5000);
  });

  it("auto mode with positive recommendation prefers it", () => {
    expect(
      effectiveMonthlyBudget({
        monthlyBudget: 5000,
        budgetMode: "auto",
        autoReport: {
          cycleEndAt: "2026-05-24T12:00:00Z",
          daysRemaining: 10,
          spendableUntilCycleEnd: 3000,
          dailyAllowance: 300,
          vibe: "calm",
          lowestProjectedBalance: 3000,
          willCrossZero: false,
          recommendedMonthlyBudget: 7500,
          safetyBufferApplied: 0,
          availableUntilCycleEnd: 3000,
          breakdown: {
            cycleEndAt: "2026-05-24T12:00:00Z",
            nextSalaryAt: "2026-05-25T00:00:00Z",
            daysRemaining: 10,
            bankBalance: 3000,
            expectedIncomeUntilCycle: 0,
            pendingFixedUntilCycle: 0,
            pendingLoansUntilCycle: 0,
            pendingCardUntilCycle: 0,
            safetyBuffer: 0,
            available: 3000,
            isNegative: false,
            hasAnchors: true,
            hasIncomes: false,
          },
        },
      }),
    ).toBe(7500);
  });
});
