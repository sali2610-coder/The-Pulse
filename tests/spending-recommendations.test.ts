import { describe, expect, it } from "vitest";

import { spendingRecommendations } from "@/lib/spending-recommendations";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date("2026-05-20T08:00:00.000Z");

function entry(
  amount: number,
  day: number,
  opts: Partial<ExpenseEntry> = {},
): ExpenseEntry {
  const date = new Date(2026, 4, day).toISOString();
  return {
    id: opts.id ?? `e-${day}-${amount}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: opts.category ?? "food",
    source: "manual",
    createdAt: date,
    ...opts,
  };
}

function priorMonth(
  amount: number,
  monthIdx0: number,
  cat: ExpenseEntry["category"] = "food",
): ExpenseEntry {
  const date = new Date(2026, monthIdx0, 5).toISOString();
  return {
    id: `prior-${monthIdx0}-${amount}-${cat}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: cat,
    source: "manual",
    createdAt: date,
  };
}

describe("spendingRecommendations", () => {
  it("returns empty when nothing is set up", () => {
    const r = spendingRecommendations({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(r).toEqual([]);
  });

  it("fires over_budget at >= 100% projected", () => {
    const r = spendingRecommendations({
      entries: [entry(11000, 1)],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 10000,
      now: NOW,
    });
    expect(r.find((x) => x.id === "over_budget")).toBeDefined();
  });

  it("fires high_pace between 85% and 100%", () => {
    const r = spendingRecommendations({
      entries: [entry(8600, 1)],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 10000,
      now: NOW,
    });
    expect(r.find((x) => x.id === "high_pace")).toBeDefined();
    expect(r.find((x) => x.id === "over_budget")).toBeUndefined();
  });

  it("never emits high_pace AND safe_pace together", () => {
    const r = spendingRecommendations({
      entries: [entry(8600, 1)],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 10000,
      now: NOW,
    });
    const hp = r.find((x) => x.id === "high_pace");
    const sp = r.find((x) => x.id === "safe_pace");
    expect(Boolean(hp && sp)).toBe(false);
  });

  it("flags category_drift when current pace runs 25%+ over the 3mo median", () => {
    const r = spendingRecommendations({
      entries: [
        // current month: spent 2000 on food in first half → projects to ~3100 EOM
        entry(2000, 10, { category: "food" }),
        // prior months: stable 1000
        priorMonth(1000, 1),
        priorMonth(1000, 2),
        priorMonth(1000, 3),
      ],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    const drift = r.find((x) => x.id.startsWith("category_drift:"));
    expect(drift).toBeDefined();
  });

  it("emits card_pressure when card usage crosses 75%", () => {
    const card: Account = {
      id: "card-cal",
      kind: "card",
      label: "CAL",
      active: true,
      cardLast4: "1234",
      creditLimit: 1000,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const heavyRule: RecurringRule = {
      id: "rule-card",
      label: "Big sub",
      category: "bills",
      estimatedAmount: 900,
      dayOfMonth: 5,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      paymentSource: "card",
      linkedCardId: card.id,
    };
    const r = spendingRecommendations({
      entries: [],
      rules: [heavyRule],
      statuses: [],
      accounts: [card],
      monthlyBudget: 0,
      now: NOW,
    });
    const cp = r.find((x) => x.id.startsWith("card_pressure:"));
    expect(cp).toBeDefined();
    expect(cp?.severity).toBe("watch");
  });

  it("fixed_squeeze fires when commitments leave <10% headroom", () => {
    const heavyRule: RecurringRule = {
      id: "rule-rent",
      label: "Rent",
      category: "bills",
      estimatedAmount: 9300,
      dayOfMonth: 28,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const r = spendingRecommendations({
      entries: [],
      rules: [heavyRule],
      statuses: [],
      accounts: [],
      monthlyBudget: 10000,
      now: NOW,
    });
    expect(r.find((x) => x.id === "fixed_squeeze")).toBeDefined();
  });
});
