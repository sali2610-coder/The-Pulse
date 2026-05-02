import { describe, expect, it } from "vitest";
import { findMatchingRule } from "@/lib/match";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function makeEntry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e",
    amount: 350,
    category: "bills",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 12).toISOString(),
    createdAt: new Date(2026, 4, 12).toISOString(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r",
    label: "חשמל",
    category: "bills",
    estimatedAmount: 350,
    dayOfMonth: 12,
    keywords: ["חשמל"],
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
    ...overrides,
  };
}

describe("findMatchingRule", () => {
  it("matches by amount within ±25%", () => {
    const rule = makeRule({ estimatedAmount: 400 });
    const entry = makeEntry({ amount: 320 }); // -20%
    expect(findMatchingRule({ entry, rules: [rule], statuses: [] })?.id).toBe(
      rule.id,
    );
  });

  it("rejects amount outside tolerance", () => {
    const rule = makeRule({ estimatedAmount: 400, keywords: [] });
    const entry = makeEntry({ amount: 100, note: "" });
    expect(
      findMatchingRule({ entry, rules: [rule], statuses: [] }),
    ).toBeUndefined();
  });

  it("matches by keyword in note", () => {
    const rule = makeRule({ estimatedAmount: 999, keywords: ["חשמל"] });
    const entry = makeEntry({ amount: 25, note: "תשלום חשמל לחודש" });
    expect(findMatchingRule({ entry, rules: [rule], statuses: [] })?.id).toBe(
      rule.id,
    );
  });

  it("does not match a paid rule", () => {
    const rule = makeRule();
    const entry = makeEntry();
    const monthKey = "2026-05";
    const matched = findMatchingRule({
      entry,
      rules: [rule],
      statuses: [
        {
          ruleId: rule.id,
          monthKey,
          status: "paid",
          matchedExpenseId: "other",
        },
      ],
    });
    expect(matched).toBeUndefined();
  });

  it("does not match across categories", () => {
    const rule = makeRule({ category: "bills" });
    const entry = makeEntry({ category: "food" });
    expect(
      findMatchingRule({ entry, rules: [rule], statuses: [] }),
    ).toBeUndefined();
  });

  it("does not match inactive rules", () => {
    const rule = makeRule({ active: false });
    const entry = makeEntry();
    expect(
      findMatchingRule({ entry, rules: [rule], statuses: [] }),
    ).toBeUndefined();
  });
});
