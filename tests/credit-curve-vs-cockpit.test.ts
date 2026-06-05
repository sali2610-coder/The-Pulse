// Phase 388 — Time-screen curve must include every credit shekel
// the Expenses cockpit counts.
//
// Bug: buildCashFlowBuckets silently dropped credit-card entries
// whose effective-cash-date stream couldn't resolve a viaCardId, and
// misrouted card-settled rules without viaCardId to the bank bucket.
// Result: liquidityCurve's "card" event total < cockpit credit
// total. Time-screen forecast deducted less than the canonical
// Expenses-cockpit number.
//
// Invariant: Σ buckets.source === "card" totalMonthly  >=  cockpit
// credit total minus card events whose effectiveCashDate is already
// in the past at "now" (those have already settled and the bank
// anchor already reflects them).

import { describe, expect, it } from "vitest";

import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import type {
  Account,
  ExpenseEntry,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 5, 5, 12, 0, 0); // June 5
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

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 250,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 5, 6, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 5, 6, 12, 0, 0).toISOString(),
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "bills",
    estimatedAmount: 540,
    dayOfMonth: 12,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("Phase 388 — curve never drops a credit impact", () => {
  it("credit entries land on the curve even when NO card account exists", () => {
    const accounts: Account[] = [bank()]; // no card account!
    const entries: ExpenseEntry[] = [
      entry({
        id: "e-manual",
        source: "manual",
        amount: 250,
      }),
      entry({
        id: "e-wallet",
        source: "wallet",
        amount: 120,
        chargeDate: new Date(2026, 5, 7, 12, 0, 0).toISOString(),
        createdAt: new Date(2026, 5, 7, 12, 0, 0).toISOString(),
      }),
    ];
    const report = buildCashFlowBuckets({
      accounts,
      loans: [] as Loan[],
      rules: [],
      statuses: [],
      entries,
      now: NOW,
      windowDays: 60,
    });
    const cardBuckets = report.buckets.filter((b) => b.source === "card");
    const cardTotal = cardBuckets.reduce((s, b) => s + b.monthlyTotal, 0);
    // Both entries (250 + 120) should land on the synthetic
    // unassigned-card bucket.
    expect(cardTotal).toBeCloseTo(370, 2);

    const exposure = getCreditCardExposure({
      rules: [],
      entries,
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(cardTotal).toBeCloseTo(exposure.totalExpectedCharge, 2);
  });

  it("card-settled rule with no card lands in CARD lane (not bank)", () => {
    const accounts: Account[] = [bank()]; // no card account
    const rules: RecurringRule[] = [
      rule({
        id: "r-card",
        estimatedAmount: 540,
        paymentSource: "card",
        linkedCardId: "missing-card",
      }),
    ];
    const report = buildCashFlowBuckets({
      accounts,
      loans: [] as Loan[],
      rules,
      statuses: [],
      entries: [] as ExpenseEntry[],
      now: NOW,
      windowDays: 60,
    });
    const cardBuckets = report.buckets.filter((b) => b.source === "card");
    const bankDebitBuckets = report.buckets.filter(
      (b) => b.source === "bank_debit",
    );
    const cardTotal = cardBuckets.reduce((s, b) => s + b.monthlyTotal, 0);
    const bankTotal = bankDebitBuckets.reduce(
      (s, b) => s + b.monthlyTotal,
      0,
    );
    expect(cardTotal).toBeGreaterThan(0);
    // Bank lane must NOT receive the card rule (the pre-Phase-388
    // misrouting that broke user trust).
    expect(bankTotal).toBe(0);
  });
});
