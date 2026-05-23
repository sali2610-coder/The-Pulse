import { describe, expect, it } from "vitest";

import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { effectiveCashImpactForRule } from "@/lib/effective-cash-date";
import type {
  Account,
  ExpenseEntry,
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

describe("effectiveCashImpactForRule (Phase 208)", () => {
  it("non-card rule lands on its declared day", () => {
    const r = rule({
      id: "r-bank",
      label: "Rent",
      dayOfMonth: 5,
      paymentSource: "bank",
    });
    const out = effectiveCashImpactForRule({
      rule: r,
      accounts: [],
      monthKey: "2026-06",
    });
    expect(out?.kind).toBe("bank");
    expect(out?.effectiveCashDate.getDate()).toBe(5);
    expect(out?.effectiveCashDate.getMonth()).toBe(5); // June
  });

  it("card-linked rule lands on card paymentDay", () => {
    const c = card({ id: "cal", paymentDay: 24 });
    const r = rule({
      id: "r-card",
      label: "Insurance",
      dayOfMonth: 1,
      paymentSource: "card",
      linkedCardId: "cal",
    });
    const out = effectiveCashImpactForRule({
      rule: r,
      accounts: [c],
      monthKey: "2026-06",
    });
    expect(out?.kind).toBe("card");
    expect(out?.effectiveCashDate.getDate()).toBe(24);
    expect(out?.viaCardId).toBe("cal");
  });
});

describe("buildCashFlowBuckets", () => {
  it("empty report on empty input", () => {
    const r = buildCashFlowBuckets({
      accounts: [],
      loans: [],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
    });
    expect(r.buckets).toEqual([]);
    expect(r.totalCommitted).toBe(0);
  });

  it("routes card-linked rules into the card bucket, NOT bank_debit", () => {
    const c = card({ id: "cal", paymentDay: 24 });
    const r = rule({
      id: "ins",
      label: "Insurance",
      dayOfMonth: 1,
      paymentSource: "card",
      linkedCardId: "cal",
      estimatedAmount: 800,
    });
    const report = buildCashFlowBuckets({
      accounts: [c],
      loans: [],
      rules: [r],
      statuses: [],
      entries: [],
      now: NOW,
    });
    const cardBucket = report.buckets.find((b) => b.id === "card:cal");
    const bank = report.buckets.find((b) => b.source === "bank_debit");
    expect(cardBucket).toBeDefined();
    expect(cardBucket?.monthlyTotal).toBeGreaterThan(0);
    expect(bank).toBeUndefined();
  });

  it("creates a loan bucket per active loan", () => {
    const l = loan({ id: "mortgage", label: "Mortgage", monthlyInstallment: 4000, dayOfMonth: 20 });
    const r = buildCashFlowBuckets({
      accounts: [],
      loans: [l],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
    });
    const loanBucket = r.buckets.find((b) => b.id === "loan:mortgage");
    expect(loanBucket?.monthlyTotal).toBe(4000);
    expect(loanBucket?.label).toBe("Mortgage");
  });

  it("routes installment slices through linked card", () => {
    const c = card({ id: "cal", paymentDay: 24, cardLast4: "1234" });
    const e = entry({
      amount: 1200,
      installments: 12,
      iso: "2026-05-02T10:00:00Z",
      cardLast4: "1234",
    });
    const r = buildCashFlowBuckets({
      accounts: [c],
      loans: [],
      rules: [],
      statuses: [],
      entries: [e],
      now: NOW,
    });
    const cardBucket = r.buckets.find((b) => b.id === "card:cal");
    expect(cardBucket).toBeDefined();
    // At least one slice in the 35-day window.
    expect(cardBucket!.obligationCount).toBeGreaterThanOrEqual(1);
  });

  it("bank_debit bucket only for non-card recurring rules", () => {
    const r1 = rule({
      id: "rent",
      label: "Rent",
      dayOfMonth: 20,
      paymentSource: "bank",
      estimatedAmount: 4000,
    });
    const r2 = rule({
      id: "sub",
      label: "Netflix",
      dayOfMonth: 25,
      paymentSource: "card",
      linkedCardId: "cal",
      estimatedAmount: 60,
    });
    const c = card({ id: "cal", paymentDay: 10 });
    const r = buildCashFlowBuckets({
      accounts: [c],
      loans: [],
      rules: [r1, r2],
      statuses: [],
      entries: [],
      now: NOW,
    });
    const bank = r.buckets.find((b) => b.source === "bank_debit");
    const cardBucket = r.buckets.find((b) => b.id === "card:cal");
    expect(bank?.monthlyTotal).toBe(4000);
    expect(cardBucket).toBeDefined();
  });

  it("sorts buckets by next settlement date (soonest first)", () => {
    const c = card({ id: "cal", paymentDay: 24 });
    const l = loan({ id: "loan-a", dayOfMonth: 20, monthlyInstallment: 1000 });
    const r = buildCashFlowBuckets({
      accounts: [c, bank("b", 1000)],
      loans: [l],
      rules: [],
      statuses: [],
      entries: [],
      now: NOW,
    });
    const ts = r.buckets.map((b) =>
      b.nextSettlementAt ? new Date(b.nextSettlementAt).getTime() : 0,
    );
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i] >= ts[i - 1]).toBe(true);
    }
  });
});
