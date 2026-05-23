// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  confidenceForBridge,
  confidenceForSpentThisMonth,
} from "@/lib/confidence";
import { dataFreshness } from "@/lib/data-freshness";
import { forecastTimeline } from "@/lib/forecast-timeline";
import {
  explainAccountBridge,
  explainMonthlySpent,
} from "@/lib/explainability";
import { spendingTruth } from "@/lib/spending-truth";
import { monthlySpent } from "@/lib/monthly-spent";
import { accountBridge } from "@/lib/account-bridge";
import {
  _resetCorrectionsForTests,
  hasCorrectionFor,
  listCorrections,
  recordCorrection,
  removeCorrection,
} from "@/lib/corrections";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function bank(id: string, anchor?: number): Account {
  return {
    id,
    kind: "bank",
    label: id,
    active: true,
    anchorBalance: anchor,
    anchorUpdatedAt: anchor !== undefined ? NOW.toISOString() : undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
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
function rule(opts: Partial<RecurringRule> & { id: string }): RecurringRule {
  return {
    label: "rule",
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 1,
    keywords: [],
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
function loan(opts: Partial<Loan> & { id: string }): Loan {
  return {
    label: "loan",
    monthlyInstallment: 500,
    dayOfMonth: 10,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

describe("confidence scorers", () => {
  it("spent confidence is HIGH with no pending entries", () => {
    const r = confidenceForSpentThisMonth({
      entries: [entry({ amount: 100, iso: "2026-05-05T10:00:00Z" })],
    });
    expect(r.level).toBe("high");
  });

  it("spent confidence is MEDIUM when many are pending", () => {
    const r = confidenceForSpentThisMonth({
      entries: [
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z" }),
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", needsConfirmation: true }),
        entry({ amount: 100, iso: "2026-05-05T10:00:00Z", bankPending: true }),
      ],
    });
    expect(r.level).toBe("medium");
  });

  it("spent confidence is LOW with no entries", () => {
    const r = confidenceForSpentThisMonth({ entries: [] });
    expect(r.level).toBe("low");
  });

  it("bridge confidence is LOW without anchors", () => {
    const r = confidenceForBridge({
      accounts: [],
      incomes: [],
      loans: [],
      rules: [],
    });
    expect(r.level).toBe("low");
  });

  it("bridge confidence is HIGH with anchors + income + obligations", () => {
    const r = confidenceForBridge({
      accounts: [bank("a", 5000)],
      incomes: [income({ id: "s" })],
      loans: [loan({ id: "l" })],
      rules: [],
    });
    expect(r.level).toBe("high");
  });
});

describe("data freshness", () => {
  it("bucket is `stale` when lastSyncedAt missing", () => {
    const r = dataFreshness({
      entries: [],
      rules: [],
      loans: [],
      incomes: [],
      lastSyncedAt: 0,
      now: NOW,
    });
    expect(r.bucket).toBe("stale");
    expect(r.ageOfLastSyncSeconds).toBeNull();
  });

  it("bucket is `fresh` within the last hour", () => {
    const r = dataFreshness({
      entries: [],
      rules: [],
      loans: [],
      incomes: [],
      lastSyncedAt: NOW.getTime() - 60 * 1000,
      now: NOW,
    });
    expect(r.bucket).toBe("fresh");
  });

  it("surfaces next income and next obligation days", () => {
    const r = dataFreshness({
      entries: [],
      rules: [rule({ id: "r", dayOfMonth: 22 })],
      loans: [loan({ id: "l", dayOfMonth: 28 })],
      incomes: [income({ id: "s", dayOfMonth: 25 })],
      lastSyncedAt: NOW.getTime(),
      now: NOW,
    });
    expect(r.nextIncomeDay).toBe(25);
    expect(r.nextObligationDay).toBe(22);
  });
});

describe("forecastTimeline", () => {
  it("returns ordered upcoming events for the rest of the month", () => {
    const events = forecastTimeline({
      entries: [entry({ amount: 200, iso: "2026-05-28T10:00:00Z", merchant: "Sub" })],
      rules: [rule({ id: "r1", dayOfMonth: 20 })],
      loans: [loan({ id: "l1", dayOfMonth: 25 })],
      incomes: [income({ id: "i1", dayOfMonth: 22 })],
      now: NOW,
    });
    expect(events.map((e) => e.kind)).toEqual([
      "recurring",
      "salary",
      "loan",
      "card_slice",
    ]);
    // inflow positive, outflow negative
    expect(events.find((e) => e.kind === "salary")!.amount).toBeGreaterThan(0);
    expect(events.find((e) => e.kind === "loan")!.amount).toBeLessThan(0);
  });

  it("skips past-day events", () => {
    const events = forecastTimeline({
      entries: [],
      rules: [rule({ id: "r-past", dayOfMonth: 1 })],
      loans: [],
      incomes: [],
      now: NOW,
    });
    expect(events).toEqual([]);
  });
});

describe("spendingTruth", () => {
  it("expands monthlySpent with daily average + biggest cat", () => {
    const entries = [
      entry({ amount: 200, iso: "2026-05-05T10:00:00Z", category: "food" }),
      entry({ amount: 100, iso: "2026-05-10T10:00:00Z", category: "transport" }),
    ];
    const truth = spendingTruth({ entries, now: NOW });
    expect(truth.spentSoFar).toBe(300);
    expect(truth.dailyAverage).toBe(20);
    expect(truth.biggestCategory?.category).toBe("food");
    expect(truth.biggestCategory?.share).toBeCloseTo(0.67, 2);
  });

  it("burnRate is calm when below prior month's pace", () => {
    const entries = [
      // current month: only 100 by day 15
      entry({ amount: 100, iso: "2026-05-05T10:00:00Z" }),
      // prior month: 600 by day 15 → projection: 1240
      entry({ amount: 600, iso: "2026-04-05T10:00:00Z" }),
    ];
    const truth = spendingTruth({ entries, now: NOW });
    expect(truth.burnRate).toBe("calm");
  });
});

describe("explainability", () => {
  it("explainMonthlySpent ends with a total row", () => {
    const spent = monthlySpent({ entries: [], now: NOW });
    const e = explainMonthlySpent(spent);
    expect(e.lines.at(-1)?.total).toBe(true);
  });

  it("explainAccountBridge total matches bridge final", () => {
    const bridge = accountBridge({
      accounts: [bank("a", 10000)],
      loans: [loan({ id: "l", dayOfMonth: 28 })],
      incomes: [income({ id: "i", dayOfMonth: 28 })],
      entries: [],
      rules: [],
      statuses: [],
      now: NOW,
    });
    const e = explainAccountBridge(bridge);
    const final = e.lines.find((l) => l.total);
    expect(final?.amount).toBe(bridge.expectedBalanceAfterAllObligations);
  });
});

describe("corrections store", () => {
  beforeEach(() => _resetCorrectionsForTests());

  it("records + lists corrections", () => {
    const r = recordCorrection({
      targetId: "e-1",
      targetKind: "entry",
      kind: "wrong_category",
      suggestedCategory: "food",
    });
    expect(listCorrections()).toHaveLength(1);
    expect(hasCorrectionFor("e-1")).toBe(true);
    removeCorrection(r.id);
    expect(listCorrections()).toEqual([]);
  });

  it("survives bad JSON / disabled storage gracefully", () => {
    window.localStorage.setItem("sally.corrections.v1", "not-json");
    expect(listCorrections()).toEqual([]);
  });
});
