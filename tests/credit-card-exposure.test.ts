// Phase 371 — canonical Credit Card Exposure contract.
//
// Pins:
//   • Every entry.id appears in AT MOST one entry bucket.
//   • Every rule.id appears in AT MOST futureCardCharges.
//   • totalExpectedCharge = Σ of all six buckets.
//   • Withdrawals never contribute.
//   • Refunds never contribute.
//   • FX entries excluded.

import { describe, expect, it } from "vitest";

import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import type {
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;
const MONTH_DATE = new Date(2026, 5, 10, 12, 0, 0).toISOString();

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

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: MONTH_DATE,
    createdAt: MONTH_DATE,
    ...o,
  };
}

describe("getCreditCardExposure", () => {
  it("card-settled rule lands in futureCardCharges only", () => {
    const r = getCreditCardExposure({
      rules: [
        rule({
          id: "r-1",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.futureCardCharges).toBe(540);
    expect(r.totalExpectedCharge).toBe(540);
    expect(r.counts.futureCardCharges).toBe(1);
  });

  it("wallet credit entry lands in walletTransactions only", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({ id: "e-wallet", source: "wallet", amount: 120 }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.walletTransactions).toBe(120);
    expect(r.manualCardTransactions).toBe(0);
    expect(r.importedTransactions).toBe(0);
  });

  it("sms imported credit entry lands in importedTransactions only", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({ id: "e-sms", source: "sms", amount: 80 }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.importedTransactions).toBe(80);
    expect(r.walletTransactions).toBe(0);
  });

  it("CSV-imported entry (externalId starts import:) → importedTransactions", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({
          id: "e-csv",
          source: "auto",
          externalId: "import:cal:2026-06-01:100:Shufersal",
          amount: 100,
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.importedTransactions).toBe(100);
  });

  it("manual single-installment credit entry → manualCardTransactions", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [entry({ id: "e-manual", source: "manual", amount: 250 })],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.manualCardTransactions).toBe(250);
  });

  it("multi-installment credit entry → existingInstallments (slice math)", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({
          id: "e-bnpl",
          source: "manual",
          amount: 600,
          installments: 3,
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    // Slice math = 600/3 = 200 this month.
    expect(r.existingInstallments).toBe(200);
    expect(r.manualCardTransactions).toBe(0);
  });

  it("pending entry → pendingTransactions", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({
          id: "e-pending",
          source: "wallet",
          amount: 90,
          needsConfirmation: true,
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.pendingTransactions).toBe(90);
    expect(r.walletTransactions).toBe(0);
  });

  it("withdrawal entry NEVER contributes", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({
          id: "e-withdraw",
          source: "manual",
          paymentMethod: "credit",
          amount: 800,
          transactionType: "withdrawal",
          withdrawalKind: "atm",
        }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.totalExpectedCharge).toBe(0);
  });

  it("refund entry NEVER contributes", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({ id: "e-refund", amount: 500, isRefund: true }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.totalExpectedCharge).toBe(0);
  });

  it("FX entry excluded", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [
        entry({ id: "e-fx", amount: 100, currency: "USD" }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.totalExpectedCharge).toBe(0);
  });

  it("excludeFromBudget entry excluded", () => {
    const r = getCreditCardExposure({
      rules: [],
      entries: [entry({ id: "e-ex", amount: 100, excludeFromBudget: true })],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.totalExpectedCharge).toBe(0);
  });

  it("totalExpectedCharge equals sum of six buckets", () => {
    const r = getCreditCardExposure({
      rules: [
        rule({
          id: "r-card",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [
        entry({ id: "e-wallet", source: "wallet", amount: 120 }),
        entry({ id: "e-sms", source: "sms", amount: 80 }),
        entry({ id: "e-manual", source: "manual", amount: 250 }),
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
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.totalExpectedCharge).toBe(
      r.futureCardCharges +
        r.existingInstallments +
        r.walletTransactions +
        r.importedTransactions +
        r.manualCardTransactions +
        r.pendingTransactions,
    );
    expect(r.totalExpectedCharge).toBe(540 + 200 + 120 + 80 + 250 + 90);
  });

  it("no id appears in more than one bucket", () => {
    const r = getCreditCardExposure({
      rules: [
        rule({
          id: "r-1",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [
        entry({ id: "e-1", source: "wallet", amount: 120 }),
        entry({ id: "e-2", source: "sms", amount: 80 }),
      ],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    const ids = r.breakdown.map((row) => row.id);
    const seen = new Set<string>();
    for (const id of ids) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("paid rule excluded from futureCardCharges", () => {
    const r = getCreditCardExposure({
      rules: [
        rule({
          id: "r-1",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [],
      statuses: [
        {
          ruleId: "r-1",
          monthKey: MONTH_KEY,
          status: "paid",
        },
      ],
      monthKey: MONTH_KEY,
    });
    expect(r.futureCardCharges).toBe(0);
  });
});
