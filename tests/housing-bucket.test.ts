import { describe, expect, it } from "vitest";

import {
  buildHousingBucket,
  classifyHousingRule,
} from "@/lib/housing-bucket";
import type { MonthKey, RecurringRule } from "@/types/finance";

const MONTH: MonthKey = "2026-05";

function rule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: `r-${overrides.label ?? "x"}`,
    label: "",
    category: "bills",
    estimatedAmount: 0,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyHousingRule", () => {
  it("classifies rent label as rent-mortgage", () => {
    const r = rule({ label: "שכירות חודשית", category: "other" });
    expect(classifyHousingRule(r)).toBe("rent-mortgage");
  });

  it("classifies electricity by label", () => {
    expect(
      classifyHousingRule(rule({ label: "חשמל", category: "bills" })),
    ).toBe("electricity");
  });

  it("classifies Netflix as streaming", () => {
    expect(
      classifyHousingRule(rule({ label: "Netflix", category: "entertainment" })),
    ).toBe("streaming");
  });

  it("falls back to other-housing when category is bills but no keyword matched", () => {
    expect(
      classifyHousingRule(rule({ label: "אגרה עירונית", category: "bills" })),
    ).toBe("other-housing");
  });

  it("returns null for non-bills + no keyword", () => {
    expect(
      classifyHousingRule(rule({ label: "Burger", category: "food" })),
    ).toBeNull();
  });
});

describe("buildHousingBucket", () => {
  it("aggregates rules by subcategory and sorts by total desc", () => {
    const bucket = buildHousingBucket({
      rules: [
        rule({
          label: "שכירות",
          estimatedAmount: 5000,
          category: "other",
        }),
        rule({
          label: "חשמל",
          estimatedAmount: 400,
          category: "bills",
        }),
        rule({
          label: "ארנונה",
          estimatedAmount: 600,
          category: "bills",
        }),
      ],
      totalMonthlyIncome: 12000,
      monthKey: MONTH,
    });
    expect(bucket.totalMonthly).toBe(6000);
    expect(bucket.shareOfIncome).toBeCloseTo(0.5, 2);
    expect(bucket.rows[0].sub).toBe("rent-mortgage");
    expect(bucket.rows.map((r) => r.sub)).toEqual([
      "rent-mortgage",
      "arnona",
      "electricity",
    ]);
  });

  it("skips inactive rules", () => {
    const bucket = buildHousingBucket({
      rules: [
        rule({
          label: "Netflix",
          estimatedAmount: 70,
          category: "entertainment",
          active: false,
        }),
      ],
      totalMonthlyIncome: 0,
      monthKey: MONTH,
    });
    expect(bucket.rows).toHaveLength(0);
  });

  it("omits shareOfIncome when there's no income data", () => {
    const bucket = buildHousingBucket({
      rules: [
        rule({
          label: "ועד בית",
          estimatedAmount: 200,
          category: "bills",
        }),
      ],
      totalMonthlyIncome: 0,
      monthKey: MONTH,
    });
    expect(bucket.shareOfIncome).toBeUndefined();
  });
});
