import { describe, expect, it } from "vitest";

import { buildCategorySpend } from "@/lib/category-spend";
import type {
  ExpenseEntry,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
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

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Spotify",
    category: "entertainment",
    estimatedAmount: 30,
    dayOfMonth: 12,
    keywords: [],
    paymentSource: "card",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

const MAY = "2026-05" as const;

describe("buildCategorySpend", () => {
  it("returns empty when nothing fires this month", () => {
    const r = buildCategorySpend({
      entries: [],
      rules: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(r.byCategory).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("treats entries as discretionary spend", () => {
    const r = buildCategorySpend({
      entries: [
        entry({ id: "a", amount: 200, category: "food" }),
        entry({ id: "b", amount: 80, category: "food" }),
      ],
      rules: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(r.byCategory).toHaveLength(1);
    expect(r.byCategory[0].discretionary).toBe(280);
    expect(r.byCategory[0].recurring).toBe(0);
    expect(r.byCategory[0].total).toBe(280);
  });

  it("treats active rules as recurring spend", () => {
    const r = buildCategorySpend({
      entries: [],
      rules: [
        rule({ id: "r1", category: "bills", estimatedAmount: 300 }),
        rule({ id: "r2", category: "bills", estimatedAmount: 150 }),
      ],
      statuses: [],
      monthKey: MAY,
    });
    const bills = r.byCategory.find((c) => c.category === "bills");
    if (!bills) throw new Error("missing bills");
    expect(bills.recurring).toBe(450);
    expect(bills.discretionary).toBe(0);
    expect(bills.total).toBe(450);
  });

  it("skips rules already marked paid this month", () => {
    const statuses: RecurringStatus[] = [
      { ruleId: "r1", monthKey: MAY, status: "paid" },
    ];
    const r = buildCategorySpend({
      entries: [],
      rules: [rule({ id: "r1", category: "bills", estimatedAmount: 300 })],
      statuses,
      monthKey: MAY,
    });
    expect(r.byCategory).toHaveLength(0);
  });

  it("sorts categories by total descending", () => {
    const r = buildCategorySpend({
      entries: [
        entry({ id: "a", amount: 50, category: "food" }),
        entry({ id: "b", amount: 600, category: "health" }),
        entry({ id: "c", amount: 200, category: "transport" }),
      ],
      rules: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(r.byCategory.map((c) => c.category)).toEqual([
      "health",
      "transport",
      "food",
    ]);
  });

  it("merges entry + rule contributions into the same category", () => {
    const r = buildCategorySpend({
      entries: [
        entry({ id: "a", amount: 250, category: "entertainment" }),
      ],
      rules: [
        rule({
          id: "spotify",
          category: "entertainment",
          estimatedAmount: 30,
        }),
      ],
      statuses: [],
      monthKey: MAY,
    });
    const ent = r.byCategory.find((c) => c.category === "entertainment");
    if (!ent) throw new Error("missing entertainment");
    expect(ent.discretionary).toBe(250);
    expect(ent.recurring).toBe(30);
    expect(ent.total).toBe(280);
    expect(ent.items).toHaveLength(2);
  });
});
