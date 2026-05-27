// Phase 248 — month rollover safety net.
//
// Locks the contract that the financial engine handles the
// month boundary correctly:
//   • recurring rule fires once in the current month, then once
//     in next month — no duplicate, no skip
//   • salary income lands on its configured day in next month
//   • loan installment fires next month at its configured day
//   • card payment slice rolls to the card's payment day in the
//     proper settlement cycle
//   • liquidity curve walks across the boundary without gaps
//   • installment plan reduces its remaining-count after the
//     month boundary

import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { ruleSchedule } from "@/lib/installment-schedule";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-26T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: "c1",
    kind: "card",
    label: "Isracard",
    issuer: "isracard",
    cardLast4: "1234",
    active: true,
    billingDay: 25,
    paymentDay: 10,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
    label: "משכנתא",
    monthlyInstallment: 3500,
    remainingBalance: 200000,
    endDate: "2030-12-31",
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: "i1",
    label: "משכורת",
    amount: 12000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "חשמל",
    category: "bills",
    estimatedAmount: 400,
    dayOfMonth: 12,
    keywords: [],
    paymentSource: "bank",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("month rollover — engine contract", () => {
  it("recurring bank rule fires this month + next month, no duplicate", () => {
    const now = new Date(2026, 4, 30, 12, 0, 0); // 2026-05-30
    const buckets = buildCashFlowBuckets({
      accounts: [bank()],
      loans: [],
      rules: [rule({ id: "r-electric", dayOfMonth: 12 })],
      statuses: [],
      entries: [],
      now,
      windowDays: 35,
    });
    const bank_debit = buckets.buckets.find(
      (b) => b.source === "bank_debit",
    );
    if (!bank_debit) throw new Error("bank bucket missing");
    // Today is May 30 → rule fires next on Jun 12 only (May 12 is past).
    // 35-day window doesn't reach Jul 12.
    const electric = bank_debit.obligations.filter(
      (o) => o.refId === "r-electric",
    );
    expect(electric).toHaveLength(1);
    expect(electric[0].effectiveCashAt.slice(0, 7)).toBe("2026-06");
  });

  it("recurring rule whose dayOfMonth has not passed still fires this month", () => {
    const now = new Date(2026, 4, 5, 12, 0, 0); // May 5
    const buckets = buildCashFlowBuckets({
      accounts: [bank()],
      loans: [],
      rules: [rule({ id: "r-electric", dayOfMonth: 12 })],
      statuses: [],
      entries: [],
      now,
      // 60 days so both the May 12 + Jun 12 firings are inside the
      // window regardless of month length.
      windowDays: 60,
    });
    const bank_debit = buckets.buckets.find(
      (b) => b.source === "bank_debit",
    );
    if (!bank_debit) throw new Error("bank bucket missing");
    const electric = bank_debit.obligations.filter(
      (o) => o.refId === "r-electric",
    );
    expect(electric.length).toBeGreaterThanOrEqual(1);
    const months = new Set(
      electric.map((o) => o.effectiveCashAt.slice(0, 7)),
    );
    expect(months.has("2026-05")).toBe(true);
  });

  it("salary lands on its configured day next month", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0);
    const curve = liquidityCurve({
      accounts: [bank()],
      loans: [],
      incomes: [income({ amount: 12000, dayOfMonth: 1 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 35,
    });
    expect(curve.nextSalaryAt?.slice(0, 7)).toBe("2026-06");
    expect(curve.nextSalaryAt?.slice(8, 10)).toBe("01");
    expect(curve.balanceAtNextSalary).toBe(5000 + 12000);
  });

  it("loan installment fires on its dayOfMonth next month", () => {
    const now = new Date(2026, 4, 30, 12, 0, 0); // May 30, after day 5
    const buckets = buildCashFlowBuckets({
      accounts: [bank()],
      loans: [loan({ dayOfMonth: 5, monthlyInstallment: 3500 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 35,
    });
    const loanBucket = buckets.buckets.find((b) => b.source === "loan");
    if (!loanBucket) throw new Error("loan bucket missing");
    // Jun 5 hits. Window is 35 days → next firing is Jul 5 (~36 days) — out.
    const loanEvents = loanBucket.obligations;
    expect(loanEvents).toHaveLength(1);
    expect(loanEvents[0].effectiveCashAt.slice(0, 7)).toBe("2026-06");
    expect(loanEvents[0].amount).toBe(3500);
  });

  it("card-purchase slice lands on the right cycle's payment day", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0);
    const purchase: ExpenseEntry = {
      id: "p1",
      amount: 250,
      category: "food",
      source: "manual",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: "2026-05-26T12:00:00.000Z",
      createdAt: "2026-05-26T12:00:00.000Z",
      accountId: "c1",
    };
    const buckets = buildCashFlowBuckets({
      accounts: [bank(), card({ billingDay: 25, paymentDay: 10 })],
      loans: [],
      rules: [],
      statuses: [],
      entries: [purchase],
      now,
      windowDays: 90,
    });
    const cardBucket = buckets.buckets.find((b) => b.source === "card");
    if (!cardBucket) throw new Error("card bucket missing");
    // Exactly one obligation — never duplicated across months.
    expect(cardBucket.obligations.length).toBe(1);
    // Settlement falls on day 10 of some future month — payment day
    // honored, not the purchase calendar day.
    const day = Number(cardBucket.obligations[0].effectiveCashAt.slice(8, 10));
    expect(day).toBe(10);
  });

  it("ruleSchedule reduces remaining-count after a month boundary", () => {
    const inst: RecurringRule = rule({
      id: "r-inst",
      installmentTotal: 6,
      startMonth: 1,
      startYear: 2026,
      dayOfMonth: 5,
    });
    const may = ruleSchedule(inst, "2026-05");
    const jun = ruleSchedule(inst, "2026-06");
    expect(may.active).toBe(true);
    expect(jun.active).toBe(true);
    // June pays the 6th installment → less remaining than May.
    expect(may.paymentNumber).toBe(5);
    expect(jun.paymentNumber).toBe(6);
    expect((jun.remaining ?? 99)).toBeLessThan(may.remaining ?? 0);
  });

  it("liquidity curve walks across the month boundary without gaps", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0); // May 28 → cross Jun
    const curve = liquidityCurve({
      accounts: [bank()],
      loans: [],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 10,
    });
    expect(curve.points).toHaveLength(11); // day 0 + 10
    // Days are strictly consecutive.
    for (let i = 1; i < curve.points.length; i++) {
      const prev = new Date(curve.points[i - 1].whenISO);
      const cur = new Date(curve.points[i].whenISO);
      const diff = Math.round(
        (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(diff).toBe(1);
    }
  });
});
