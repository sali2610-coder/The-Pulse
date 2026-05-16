import { describe, expect, it } from "vitest";
import { futureMonthlyPressure } from "@/lib/forecast";
import type {
  ExpenseEntry,
  Loan,
  RecurringRule,
} from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e",
    amount: 1200,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 15, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 15, 12, 0, 0).toISOString(),
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r",
    label: "Electric",
    category: "bills",
    estimatedAmount: 250,
    dayOfMonth: 14,
    keywords: [],
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
    ...overrides,
  };
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "l",
    label: "Car",
    monthlyInstallment: 700,
    remainingBalance: 700 * 12,
    endDate: new Date(2027, 4, 1).toISOString(),
    dayOfMonth: 5,
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
    ...overrides,
  };
}

const MAY = "2026-05";
const NOW = new Date(2026, 4, 1, 9, 0, 0); // May 1

describe("futureMonthlyPressure", () => {
  it("projects 3 months by default and respects monthKey + installments", () => {
    const out = futureMonthlyPressure({
      entries: [
        entry({
          amount: 2700,
          installments: 27,
          chargeDate: new Date(2026, 4, 15, 12, 0, 0).toISOString(),
        }),
      ],
      rules: [],
      loans: [],
      statuses: [],
      monthKey: MAY,
      now: NOW,
    });
    expect(out.length).toBe(3);
    expect(out.map((m) => m.monthKey)).toEqual(["2026-05", "2026-06", "2026-07"]);
    // Each month sees one 2700/27 slice.
    expect(out[0].installmentSlices).toBeCloseTo(100, 5);
    expect(out[0].activeInstallmentEntries).toBe(1);
    expect(out[1].installmentSlices).toBeCloseTo(100, 5);
    expect(out[2].installmentSlices).toBeCloseTo(100, 5);
  });

  it("does not double-count current-month slices already charged", () => {
    // Mid-May, an entry that charged on May 5 (already in the past).
    const out = futureMonthlyPressure({
      entries: [
        entry({
          amount: 500,
          installments: 1,
          chargeDate: new Date(2026, 4, 5, 12, 0, 0).toISOString(),
        }),
      ],
      rules: [],
      loans: [],
      statuses: [],
      monthKey: MAY,
      now: new Date(2026, 4, 20, 12, 0, 0),
    });
    expect(out[0].installmentSlices).toBe(0);
  });

  it("sums rules and loans alongside installment slices", () => {
    const out = futureMonthlyPressure({
      entries: [entry({ amount: 1200, installments: 12 })],
      rules: [rule()],
      loans: [loan()],
      statuses: [],
      monthKey: MAY,
      now: NOW,
    });
    // Slice 100, rule 250, loan 700 → 1050.
    expect(out[0].installmentSlices).toBeCloseTo(100, 5);
    expect(out[0].recurring).toBe(250);
    expect(out[0].loans).toBe(700);
    expect(out[0].total).toBeCloseTo(1050, 5);
  });

  it("skips paid rules for the current month only", () => {
    const out = futureMonthlyPressure({
      entries: [],
      rules: [rule()],
      loans: [],
      statuses: [
        { ruleId: "r", monthKey: MAY, status: "paid", actualAmount: 240 },
      ],
      monthKey: MAY,
      now: NOW,
      months: 2,
    });
    expect(out[0].recurring).toBe(0); // paid this month
    expect(out[1].recurring).toBe(250); // June still pending
  });

  it("skips loans whose dayOfMonth already passed in current month", () => {
    const out = futureMonthlyPressure({
      entries: [],
      rules: [],
      loans: [loan({ dayOfMonth: 3 })],
      statuses: [],
      monthKey: MAY,
      now: new Date(2026, 4, 20, 12, 0, 0), // May 20 — past day 3
      months: 2,
    });
    expect(out[0].loans).toBe(0);
    expect(out[1].loans).toBe(700);
  });

  it("skips refund / FX / pending entries", () => {
    const out = futureMonthlyPressure({
      entries: [
        entry({ amount: 200, isRefund: true }),
        entry({ id: "e2", amount: 300, currency: "USD" }),
        entry({ id: "e3", amount: 400, needsConfirmation: true }),
        entry({ id: "e4", amount: 100, bankPending: true }),
        entry({ id: "e5", amount: 50 }),
      ],
      rules: [],
      loans: [],
      statuses: [],
      monthKey: MAY,
      now: NOW,
    });
    expect(out[0].installmentSlices).toBe(50);
    expect(out[0].activeInstallmentEntries).toBe(1);
  });
});
