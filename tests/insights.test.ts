import { describe, expect, it } from "vitest";
import { buildMonthlyDigest } from "@/lib/insights";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 4, 15, 12, 0, 0); // May 15

function bank(label: string, balance: number): Account {
  return {
    id: `bank-${label}`,
    kind: "bank",
    label,
    anchorBalance: balance,
    anchorUpdatedAt: new Date(2026, 4, 1).toISOString(),
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    merchant: "Shufersal",
    ...overrides,
  };
}

const NO_LOANS: Loan[] = [];
const NO_INCOMES: Income[] = [];
const NO_RULES: RecurringRule[] = [];

describe("buildMonthlyDigest", () => {
  it("returns positive end-of-month insight when forecast is in the black", () => {
    const insights = buildMonthlyDigest({
      entries: [],
      rules: NO_RULES,
      statuses: [],
      accounts: [bank("main", 5000)],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    const eom = insights.find((i) => i.id === "eom");
    expect(eom?.tone).toBe("positive");
    expect(eom?.value).toBe(5000);
  });

  it("returns danger end-of-month insight when forecast goes negative", () => {
    const insights = buildMonthlyDigest({
      entries: [],
      rules: NO_RULES,
      statuses: [],
      accounts: [bank("main", -200)],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    const eom = insights.find((i) => i.id === "eom");
    expect(eom?.tone).toBe("danger");
  });

  it("surfaces a budget headroom insight when monthlyBudget > 0", () => {
    const insights = buildMonthlyDigest({
      entries: [entry({ amount: 200, chargeDate: new Date(2026, 4, 5).toISOString() })],
      rules: NO_RULES,
      statuses: [],
      accounts: [],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: NOW,
    });
    const budget = insights.find((i) => i.id === "budget");
    expect(budget).toBeDefined();
    expect(budget?.tone).toBe("positive");
  });

  it("danger budget tone when projected total exceeds the limit", () => {
    const insights = buildMonthlyDigest({
      entries: [entry({ amount: 6000 })],
      rules: NO_RULES,
      statuses: [],
      accounts: [],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 5000,
      monthKey: "2026-05",
      now: NOW,
    });
    const budget = insights.find((i) => i.id === "budget");
    expect(budget?.tone).toBe("danger");
  });

  it("surfaces anomalies when a charge is 1.5×/+₪20 above baseline", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 100, chargeDate: new Date(2026, 2, 5).toISOString() }),
      entry({ id: "b2", amount: 100, chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ id: "x1", amount: 350, chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const insights = buildMonthlyDigest({
      entries,
      rules: NO_RULES,
      statuses: [],
      accounts: [],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    const an = insights.find((i) => i.id === "anomalies");
    expect(an).toBeDefined();
    expect(an?.value).toBe(1);
  });

  it("sorts dangers and warnings ahead of positives/neutrals", () => {
    const entries: ExpenseEntry[] = [
      entry({ id: "b1", amount: 100, chargeDate: new Date(2026, 2, 5).toISOString() }),
      entry({ id: "b2", amount: 100, chargeDate: new Date(2026, 3, 5).toISOString() }),
      entry({ id: "x1", amount: 350, chargeDate: new Date(2026, 4, 5).toISOString() }),
    ];
    const insights = buildMonthlyDigest({
      entries,
      rules: NO_RULES,
      statuses: [],
      accounts: [bank("main", 5000)],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    // Anomalies (warning) should appear before EOM forecast (positive).
    const idxAnom = insights.findIndex((i) => i.id === "anomalies");
    const idxEom = insights.findIndex((i) => i.id === "eom");
    expect(idxAnom).toBeGreaterThanOrEqual(0);
    expect(idxEom).toBeGreaterThanOrEqual(0);
    expect(idxAnom).toBeLessThan(idxEom);
  });

  it("returns empty when there is no signal at all", () => {
    const insights = buildMonthlyDigest({
      entries: [],
      rules: NO_RULES,
      statuses: [],
      accounts: [],
      loans: NO_LOANS,
      incomes: NO_INCOMES,
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(insights).toEqual([]);
  });
});
