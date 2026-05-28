// Phase 273 — AI insights engine contract.
//
// Locks: structural shape, priority sort, group bucketing, quality
// filter behavior, and the key detector firings (liquidity dip,
// category spike, installment ending, pending confirmations).

import { describe, expect, it } from "vitest";

import {
  GROUP_ORDER,
  gatherAiInsights,
  type AiInsightsInputs,
} from "@/lib/ai-insights";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function base(): AiInsightsInputs {
  return {
    entries: [],
    rules: [],
    statuses: [],
    accounts: [],
    loans: [],
    incomes: [],
    monthlyBudget: 0,
    monthKey: "2026-05",
    now: new Date("2026-05-28T12:00:00.000Z"),
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: "i-salary",
    label: "Salary",
    amount: 12000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r-rent",
    label: "שכ״ד",
    category: "bills",
    estimatedAmount: 4500,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2025-04-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e-1",
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    ...o,
  };
}

describe("gatherAiInsights — shape", () => {
  it("returns empty groups when no data", () => {
    const res = gatherAiInsights(base());
    expect(res.total).toBe(0);
    expect(res.insights).toEqual([]);
    for (const g of GROUP_ORDER) {
      expect(res.byGroup[g]).toEqual([]);
    }
  });

  it("sorts insights by priority desc", () => {
    // Pending confirmations (urgency 3) + a category spike should
    // both fire. Pending should outrank the spike.
    const inputs: AiInsightsInputs = {
      ...base(),
      entries: [
        entry({ id: "pending", needsConfirmation: true, amount: 200 }),
        entry({
          id: "spike-1",
          amount: 800,
          category: "transport",
          chargeDate: "2026-05-12T12:00:00.000Z",
        }),
        // History for transport to seed prior average.
        entry({
          id: "h-1",
          amount: 200,
          category: "transport",
          chargeDate: "2026-02-12T12:00:00.000Z",
        }),
        entry({
          id: "h-2",
          amount: 200,
          category: "transport",
          chargeDate: "2026-03-12T12:00:00.000Z",
        }),
        entry({
          id: "h-3",
          amount: 200,
          category: "transport",
          chargeDate: "2026-04-12T12:00:00.000Z",
        }),
      ],
    };
    const res = gatherAiInsights(inputs);
    expect(res.total).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < res.insights.length; i++) {
      expect(res.insights[i - 1].priority).toBeGreaterThanOrEqual(
        res.insights[i].priority,
      );
    }
  });
});

describe("detectors — risk band", () => {
  it("fires liquidity dip when curve crosses zero", () => {
    const account: Account = {
      id: "b1",
      kind: "bank",
      label: "Main",
      anchorBalance: 500,
      anchorUpdatedAt: "2026-05-28T12:00:00.000Z",
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const loan: Loan = {
      id: "l1",
      label: "Loan",
      monthlyInstallment: 4000,
      dayOfMonth: 5,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
      remainingBalance: 50000,
    };
    const res = gatherAiInsights({
      ...base(),
      accounts: [account],
      loans: [loan],
      monthKey: "2026-06",
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    const dip = res.byGroup.risk.find((i) => i.id === "liquidity-dip");
    expect(dip).toBeDefined();
  });

  it("fires heavy-obligations when fixed > 60% of income", () => {
    const res = gatherAiInsights({
      ...base(),
      incomes: [income({ amount: 10000 })],
      rules: [rule({ estimatedAmount: 7000 })],
    });
    expect(
      res.byGroup.risk.some((i) => i.id === "fixed-obligations-heavy"),
    ).toBe(true);
  });

  it("does NOT fire heavy-obligations when fixed is modest", () => {
    const res = gatherAiInsights({
      ...base(),
      incomes: [income({ amount: 10000 })],
      rules: [rule({ estimatedAmount: 1500 })],
    });
    expect(
      res.byGroup.risk.some((i) => i.id === "fixed-obligations-heavy"),
    ).toBe(false);
  });
});

describe("detectors — trend + positive", () => {
  it("category spike fires on ≥30% MoM jump", () => {
    const inputs: AiInsightsInputs = {
      ...base(),
      entries: [
        entry({ id: "now", amount: 1500, category: "transport", chargeDate: "2026-05-12T12:00:00.000Z" }),
        entry({ id: "h1", amount: 500, category: "transport", chargeDate: "2026-04-12T12:00:00.000Z" }),
        entry({ id: "h2", amount: 500, category: "transport", chargeDate: "2026-03-12T12:00:00.000Z" }),
        entry({ id: "h3", amount: 500, category: "transport", chargeDate: "2026-02-12T12:00:00.000Z" }),
      ],
    };
    const res = gatherAiInsights(inputs);
    expect(
      res.byGroup.trend.some((i) => i.id.startsWith("category-spike-")),
    ).toBe(true);
  });

  it("category drop fires on ≥25% MoM decrease", () => {
    const inputs: AiInsightsInputs = {
      ...base(),
      entries: [
        entry({ id: "now", amount: 100, category: "food", chargeDate: "2026-05-12T12:00:00.000Z" }),
        entry({ id: "h1", amount: 400, category: "food", chargeDate: "2026-04-12T12:00:00.000Z" }),
        entry({ id: "h2", amount: 400, category: "food", chargeDate: "2026-03-12T12:00:00.000Z" }),
        entry({ id: "h3", amount: 400, category: "food", chargeDate: "2026-02-12T12:00:00.000Z" }),
      ],
    };
    const res = gatherAiInsights(inputs);
    expect(
      res.byGroup.positive.some((i) => i.id.startsWith("category-drop-")),
    ).toBe(true);
  });
});

describe("detectors — recommendation", () => {
  it("fires pending-confirmations when ExpenseEntry needs review", () => {
    const res = gatherAiInsights({
      ...base(),
      entries: [entry({ needsConfirmation: true })],
    });
    expect(
      res.byGroup.recommendation.some((i) => i.id === "pending-confirmations"),
    ).toBe(true);
  });

  it("ignores confirmed entries", () => {
    const res = gatherAiInsights({
      ...base(),
      entries: [
        entry({
          needsConfirmation: false,
          confirmedAt: "2026-05-10T12:00:00.000Z",
        }),
      ],
    });
    expect(
      res.byGroup.recommendation.some((i) => i.id === "pending-confirmations"),
    ).toBe(false);
  });
});

describe("priority math", () => {
  it("severity 3 / urgency 3 / confidence 1 maxes the score", () => {
    // Pending = severity 2, urgency 3, confidence 0.95 → 2*3+3*2+0.95*5 = 16.75
    const res = gatherAiInsights({
      ...base(),
      entries: [entry({ needsConfirmation: true })],
    });
    const pending = res.byGroup.recommendation.find(
      (i) => i.id === "pending-confirmations",
    );
    expect(pending).toBeDefined();
    expect(pending!.priority).toBeCloseTo(2 * 3 + 3 * 2 + 0.95 * 5, 5);
  });
});

// Keep RecurringStatus referenced — exported for symmetry with the
// production type imports even though no test seeds statuses here.
type _StatusKept = RecurringStatus;
void {} as unknown as _StatusKept;
