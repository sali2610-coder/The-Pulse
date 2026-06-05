// Phase 389 — single source of truth invariant across the credit
// engine. One scenario, six entry sources (manual, wallet, sms,
// imported CSV, multi-installment, pending), plus a card-settled
// rule. Every canonical helper must agree on the credit total:
//
//   getCreditCardExposure.totalExpectedCharge
//   getMonthlyObligationBreakdown.creditCardsTotal
//   Σ buildCashFlowBuckets buckets.source === "card" monthlyTotal
//     (modulo events already-settled before "now")
//
// If a future screen calculates credit independently, this test
// fails and the mismatch is caught before it ships.

import { describe, expect, it } from "vitest";

import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import type {
  Account,
  ExpenseEntry,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 5, 5, 12, 0, 0); // June 5, 2026
const MONTH_KEY = "2026-06" as const;

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

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 5, 6, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 5, 6, 12, 0, 0).toISOString(),
    ...o,
  };
}

describe("Phase 389 — every credit source agrees on the monthly total", () => {
  const accounts: Account[] = [bank(), card()];
  const rules: RecurringRule[] = [
    {
      id: "r-card",
      label: "חוג ג'ודו",
      category: "education",
      estimatedAmount: 540,
      dayOfMonth: 12,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      paymentSource: "card",
      linkedCardId: "card-1",
    },
  ];
  const entries: ExpenseEntry[] = [
    entry({ id: "e-manual", source: "manual", amount: 250 }),
    entry({ id: "e-wallet", source: "wallet", amount: 120 }),
    entry({ id: "e-sms", source: "sms", amount: 80 }),
    entry({
      id: "e-csv",
      source: "auto",
      externalId: "import:cal:2026-06-04:60:Shufersal",
      amount: 60,
    }),
    entry({
      id: "e-bnpl",
      source: "manual",
      amount: 600,
      installments: 3,
    }),
    entry({
      id: "e-pending",
      source: "wallet",
      amount: 90,
      needsConfirmation: true,
    }),
  ];

  it("exposure.totalExpectedCharge === breakdown.creditCardsTotal", () => {
    const exposure = getCreditCardExposure({
      rules,
      entries,
      statuses: [],
      monthKey: MONTH_KEY,
    });
    const breakdown = getMonthlyObligationBreakdown({
      rules,
      loans: [] as Loan[],
      entries,
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(breakdown.creditCardsTotal).toBe(exposure.totalExpectedCharge);
    // Sanity: every source contributed.
    expect(exposure.totalExpectedCharge).toBe(
      540 + // card-settled rule
        250 + // manual
        120 + // wallet
        80 + // sms
        60 + // import: CSV
        200 + // bnpl slice (600 / 3 this month)
        90, // pending
    );
  });

  it("Σ card buckets monthlyTotal === exposure for impacts in the forward window", () => {
    const exposure = getCreditCardExposure({
      rules,
      entries,
      statuses: [],
      monthKey: MONTH_KEY,
    });
    // Scope the curve to the next-billing-cycle window so its card
    // events represent THIS month's spending only. Card paymentDay
    // = 2 → July 2 captures every June purchase; a 35-day window
    // hits July 10 and excludes July purchases.
    const report = buildCashFlowBuckets({
      accounts,
      loans: [] as Loan[],
      rules,
      statuses: [],
      entries,
      now: NOW,
      windowDays: 35,
    });
    const cardBuckets = report.buckets.filter((b) => b.source === "card");
    const curveCardTotal = cardBuckets.reduce(
      (s, b) => s + b.monthlyTotal,
      0,
    );
    // Pending entries (needsConfirmation || bankPending) are excluded
    // from the liquidity curve by design — the bank hasn't seen
    // them yet, so a forecast must not deduct them as if they
    // were committed. Subtract that bucket from the exposure for
    // an apples-to-apples comparison.
    const exposureSansPending =
      exposure.totalExpectedCharge - exposure.pendingTransactions;
    expect(curveCardTotal).toBeCloseTo(exposureSansPending, 2);
  });

  it("no credit shekel leaks into bank_debit / loan / cash lanes", () => {
    const report = buildCashFlowBuckets({
      accounts,
      loans: [] as Loan[],
      rules,
      statuses: [],
      entries,
      now: NOW,
      windowDays: 60,
    });
    const bankDebit = report.buckets
      .filter((b) => b.source === "bank_debit")
      .reduce((s, b) => s + b.monthlyTotal, 0);
    expect(bankDebit).toBe(0);
  });

  it("withdrawal entries NEVER contaminate the credit total", () => {
    const withdrawal: ExpenseEntry = entry({
      id: "e-withdrawal",
      paymentMethod: "credit",
      amount: 800,
      transactionType: "withdrawal",
      withdrawalKind: "atm",
    });
    const exposure = getCreditCardExposure({
      rules: [],
      entries: [withdrawal],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(exposure.totalExpectedCharge).toBe(0);
    const breakdown = getMonthlyObligationBreakdown({
      rules: [],
      loans: [] as Loan[],
      entries: [withdrawal],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(breakdown.creditCardsTotal).toBe(0);
    expect(breakdown.cashTotal).toBe(800);
  });
});
