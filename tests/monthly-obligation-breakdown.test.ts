// Phase 370 — Monthly Obligations Cockpit canonical contract.
//
// Pinned invariants:
//   • Each rule.id / loan.id / entry.id appears in at most ONE lane.
//   • Total = creditCardsTotal + bankFixedTotal + loansTotal + cashTotal.
//   • Card-settled rules (paymentSource="card" OR linkedCardId-only)
//     count toward CREDIT_CARDS, never BANK_FIXED.
//   • Loans always count as LOANS regardless of any other signal.
//   • Withdrawal entries dated this month count as CASH.

import { describe, expect, it } from "vitest";

import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import type {
  ExpenseEntry,
  Loan,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;

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

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? `l-${Math.random().toString(36).slice(2, 8)}`,
    label: "loan",
    monthlyInstallment: 1_000,
    dayOfMonth: 10,
    startMonth: 6,
    startYear: 2026,
    totalPayments: 60,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function withdrawalEntry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 400,
    category: "other",
    source: "manual",
    paymentMethod: "cash",
    installments: 1,
    chargeDate: new Date(2026, 5, 5, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 5, 5, 12, 0, 0).toISOString(),
    transactionType: "withdrawal",
    withdrawalKind: "atm",
    ...o,
  };
}

describe("getMonthlyObligationBreakdown — canonical lane classification", () => {
  it("credit-card recurring rule counts ONLY under credit cards", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-1",
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
      ],
      loans: [],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.creditCardsTotal).toBe(540);
    expect(result.bankFixedTotal).toBe(0);
    expect(result.cashTotal).toBe(0);
    expect(result.loansTotal).toBe(0);
    expect(result.counts.creditCards).toBe(1);
  });

  it("bank recurring rule counts ONLY under bank fixed", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-2",
          label: "ארנונה",
          estimatedAmount: 800,
          paymentSource: "bank",
        }),
      ],
      loans: [],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.bankFixedTotal).toBe(800);
    expect(result.creditCardsTotal).toBe(0);
    expect(result.cashTotal).toBe(0);
    expect(result.counts.bankFixed).toBe(1);
  });

  it("loan counts ONLY under loans", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [],
      loans: [loan({ id: "l-1", monthlyInstallment: 4_970 })],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.loansTotal).toBe(4_970);
    expect(result.creditCardsTotal).toBe(0);
    expect(result.bankFixedTotal).toBe(0);
    expect(result.cashTotal).toBe(0);
    expect(result.counts.loans).toBe(1);
  });

  it("cash withdrawal counts ONLY under cash", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [],
      loans: [],
      entries: [
        withdrawalEntry({ id: "e-1", amount: 400 }),
      ],
      monthKey: MONTH_KEY,
    });
    expect(result.cashTotal).toBe(400);
    expect(result.creditCardsTotal).toBe(0);
    expect(result.bankFixedTotal).toBe(0);
    expect(result.loansTotal).toBe(0);
    expect(result.counts.cash).toBe(1);
  });

  it("total equals sum of four groups", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-card",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
        rule({ id: "r-bank", estimatedAmount: 800, paymentSource: "bank" }),
        rule({ id: "r-cash", estimatedAmount: 120, paymentSource: "cash" }),
      ],
      loans: [loan({ id: "l-1", monthlyInstallment: 4_970 })],
      entries: [withdrawalEntry({ id: "e-1", amount: 400 })],
      monthKey: MONTH_KEY,
    });
    expect(result.total).toBe(
      result.creditCardsTotal +
        result.bankFixedTotal +
        result.loansTotal +
        result.cashTotal,
    );
    expect(result.total).toBe(540 + 800 + 4_970 + 120 + 400);
  });

  it("no item id appears in more than one group", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-1",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
        rule({ id: "r-2", estimatedAmount: 800, paymentSource: "bank" }),
        rule({ id: "r-3", estimatedAmount: 120, paymentSource: "cash" }),
      ],
      loans: [loan({ id: "l-1" })],
      entries: [withdrawalEntry({ id: "e-1" })],
      monthKey: MONTH_KEY,
    });
    const ids = result.explanationRows.map((r) => r.id);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("legacy linkedCardId-only rule (no explicit paymentSource) lands in credit cards", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-legacy",
          estimatedAmount: 320,
          linkedCardId: "card-1",
          // paymentSource omitted on purpose.
        }),
      ],
      loans: [],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.creditCardsTotal).toBe(320);
    expect(result.bankFixedTotal).toBe(0);
  });

  it("unknown paymentSource defaults to bank fixed (backward compatibility)", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-legacy-bank",
          estimatedAmount: 99,
          // paymentSource omitted — should default to bank.
        }),
      ],
      loans: [],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.bankFixedTotal).toBe(99);
    expect(result.creditCardsTotal).toBe(0);
  });

  it("inactive rules and inactive loans excluded", () => {
    const result = getMonthlyObligationBreakdown({
      rules: [
        rule({ id: "r-on", estimatedAmount: 100, paymentSource: "bank" }),
        rule({
          id: "r-off",
          estimatedAmount: 500,
          paymentSource: "bank",
          active: false,
        }),
      ],
      loans: [
        loan({ id: "l-on", monthlyInstallment: 700 }),
        loan({ id: "l-off", monthlyInstallment: 9_000, active: false }),
      ],
      entries: [],
      monthKey: MONTH_KEY,
    });
    expect(result.bankFixedTotal).toBe(100);
    expect(result.loansTotal).toBe(700);
  });
});
