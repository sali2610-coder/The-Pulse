import { describe, expect, it } from "vitest";

import { detectDormantRules } from "@/lib/rule-dormancy";
import type {
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Gym",
    category: "other",
    estimatedAmount: 200,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paid(monthKey: MonthKey, ruleId = "r1"): RecurringStatus {
  return { ruleId, monthKey, status: "paid" };
}

function pending(monthKey: MonthKey, ruleId = "r1"): RecurringStatus {
  return { ruleId, monthKey, status: "pending" };
}

describe("detectDormantRules", () => {
  it("flags a rule that hasn't been paid in 3 months", () => {
    const dormant = detectDormantRules({
      rules: [rule()],
      statuses: [
        paid("2025-12"),
        pending("2026-03"),
        pending("2026-04"),
        pending("2026-05"),
      ],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(1);
    expect(dormant[0].dormantMonths).toBe(3);
    expect(dormant[0].lastPaidMonthKey).toBe("2025-12");
  });

  it("does not flag if the most recent month is paid", () => {
    const dormant = detectDormantRules({
      rules: [rule()],
      statuses: [paid("2026-05")],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(0);
  });

  it("does not flag if a prior month within lookback is paid", () => {
    const dormant = detectDormantRules({
      rules: [rule()],
      statuses: [paid("2026-04"), pending("2026-05")],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(0);
  });

  it("skips a rule created within the lookback window", () => {
    const dormant = detectDormantRules({
      rules: [rule({ createdAt: "2026-04-01T00:00:00.000Z" })],
      statuses: [],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(0);
  });

  it("skips installment plans that have legitimately completed", () => {
    const dormant = detectDormantRules({
      rules: [
        rule({
          installmentTotal: 12,
          startMonth: 1,
          startYear: 2024,
        }),
      ],
      statuses: [],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(0);
  });

  it("skips inactive rules", () => {
    const dormant = detectDormantRules({
      rules: [rule({ active: false })],
      statuses: [],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(0);
  });

  it("sorts by estimatedAmount descending", () => {
    const dormant = detectDormantRules({
      rules: [
        rule({ id: "small", label: "Magazine", estimatedAmount: 50 }),
        rule({ id: "big", label: "Gym", estimatedAmount: 300 }),
      ],
      statuses: [],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(2);
    expect(dormant[0].ruleId).toBe("big");
    expect(dormant[1].ruleId).toBe("small");
  });

  it("reports undefined lastPaidMonthKey when rule has never been paid", () => {
    const dormant = detectDormantRules({
      rules: [rule()],
      statuses: [],
      monthKey: MAY,
    });
    expect(dormant).toHaveLength(1);
    expect(dormant[0].lastPaidMonthKey).toBeUndefined();
  });
});
