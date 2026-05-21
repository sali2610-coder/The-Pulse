import { describe, expect, it } from "vitest";

import { detectRuleDrift } from "@/lib/rule-drift";
import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Netflix",
    category: "entertainment",
    estimatedAmount: 70,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function status(overrides: Partial<RecurringStatus>): RecurringStatus {
  return {
    ruleId: "r1",
    monthKey: MAY,
    status: "paid",
    actualAmount: 70,
    ...overrides,
  };
}

describe("detectRuleDrift", () => {
  it("flags a 1.5× upward drift (alert)", () => {
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [],
      statuses: [
        status({ monthKey: "2026-02", actualAmount: 70 }),
        status({ monthKey: "2026-03", actualAmount: 70 }),
        status({ monthKey: "2026-04", actualAmount: 70 }),
        status({ monthKey: "2026-05", actualAmount: 105 }),
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(1);
    expect(drift[0].direction).toBe("up");
    expect(drift[0].severity).toBe("alert");
    expect(drift[0].suggestedEstimate).toBeGreaterThan(70);
  });

  it("flags a 1.2× upward drift as watch (not alert)", () => {
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [],
      statuses: [
        status({ monthKey: "2026-02", actualAmount: 70 }),
        status({ monthKey: "2026-03", actualAmount: 70 }),
        status({ monthKey: "2026-05", actualAmount: 84 }),
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(1);
    expect(drift[0].direction).toBe("up");
    expect(drift[0].severity).toBe("watch");
  });

  it("flags a downward drift (rule overestimates)", () => {
    const drift = detectRuleDrift({
      rules: [rule({ estimatedAmount: 200 })],
      entries: [],
      statuses: [
        status({ monthKey: "2026-04", actualAmount: 140 }),
        status({ monthKey: "2026-05", actualAmount: 130 }),
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(1);
    expect(drift[0].direction).toBe("down");
    expect(drift[0].severity).toBe("alert");
  });

  it("ignores rules where the ratio sits in the dead zone (0.85–1.15)", () => {
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [],
      statuses: [
        status({ monthKey: "2026-04", actualAmount: 70 }),
        status({ monthKey: "2026-05", actualAmount: 75 }),
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(0);
  });

  it("falls back to matched entry amount when status.actualAmount missing", () => {
    const entry: ExpenseEntry = {
      id: "e1",
      amount: 130,
      category: "entertainment",
      source: "sms",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: new Date(2026, 4, 10).toISOString(),
      createdAt: new Date(2026, 4, 10).toISOString(),
    };
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [entry],
      statuses: [
        status({ monthKey: "2026-04", actualAmount: 70 }),
        {
          ruleId: "r1",
          monthKey: MAY,
          status: "paid",
          matchedExpenseId: "e1",
        },
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(1);
    expect(drift[0].currentActual).toBe(130);
  });

  it("requires the current month to be paid", () => {
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [],
      statuses: [
        status({ monthKey: "2026-04", actualAmount: 70 }),
        {
          ruleId: "r1",
          monthKey: MAY,
          status: "pending",
        },
      ],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(0);
  });

  it("requires ≥ 2 months of coverage including current", () => {
    const drift = detectRuleDrift({
      rules: [rule()],
      entries: [],
      statuses: [status({ monthKey: "2026-05", actualAmount: 200 })],
      monthKey: MAY,
    });
    expect(drift).toHaveLength(0);
  });
});
