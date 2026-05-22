import { describe, expect, it } from "vitest";

import { isSkippedStatus } from "@/lib/projections";
import { monthObligations } from "@/lib/obligations";
import { forecastEndOfMonth } from "@/lib/forecast";
import type { RecurringRule, RecurringStatus } from "@/types/finance";

const SKIP_STATUS: RecurringStatus = {
  ruleId: "r1",
  monthKey: "2026-05",
  status: "paid",
  actualAmount: 0,
};

const PAID_STATUS: RecurringStatus = {
  ruleId: "r1",
  monthKey: "2026-05",
  status: "paid",
  actualAmount: 387,
  matchedExpenseId: "e1",
};

const PENDING_STATUS: RecurringStatus = {
  ruleId: "r1",
  monthKey: "2026-05",
  status: "pending",
};

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: "חשמל",
    category: "other",
    estimatedAmount: 387,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("isSkippedStatus", () => {
  it("true for skip-pattern (status=paid + amount=0 + no matchedExpenseId)", () => {
    expect(isSkippedStatus(SKIP_STATUS)).toBe(true);
  });

  it("false for a real matched payment", () => {
    expect(isSkippedStatus(PAID_STATUS)).toBe(false);
  });

  it("false for pending", () => {
    expect(isSkippedStatus(PENDING_STATUS)).toBe(false);
  });

  it("false for undefined", () => {
    expect(isSkippedStatus(undefined)).toBe(false);
  });
});

describe("forecast excludes skipped rules from pendingFixed", () => {
  it("skipped rule counts as paid → not in pendingFixed", () => {
    const r = rule();
    const f = forecastEndOfMonth({
      accounts: [],
      loans: [],
      incomes: [],
      rules: [r],
      entries: [],
      statuses: [SKIP_STATUS],
      monthKey: "2026-05",
      now: new Date(2026, 4, 1),
    });
    expect(f.pendingFixed).toBe(0);
  });

  it("baseline: pending rule still counts", () => {
    const r = rule();
    const f = forecastEndOfMonth({
      accounts: [],
      loans: [],
      incomes: [],
      rules: [r],
      entries: [],
      statuses: [PENDING_STATUS],
      monthKey: "2026-05",
      now: new Date(2026, 4, 1),
    });
    expect(f.pendingFixed).toBe(387);
  });
});

describe("obligations marks skipped status correctly", () => {
  it("skipped rule appears with status='paid' so UI can detect via isSkippedStatus", () => {
    const r = rule();
    const items = monthObligations({
      rules: [r],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [SKIP_STATUS],
      monthKey: "2026-05",
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("paid");
  });
});
