import { describe, expect, it } from "vitest";

import { upcomingOutflows } from "@/lib/upcoming-outflows";
import type {
  ExpenseEntry,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const NOW = new Date(2026, 4, 20, 12, 0);

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 22).toISOString(),
    createdAt: new Date(2026, 4, 18).toISOString(),
    merchant: "Shufersal",
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Electricity",
    category: "bills",
    estimatedAmount: 350,
    dayOfMonth: 23,
    keywords: [],
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
    label: "Car",
    monthlyInstallment: 1500,
    remainingBalance: 60000,
    endDate: "2027-12-01",
    dayOfMonth: 25,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("upcomingOutflows", () => {
  it("collects entries + rules + loans landing within the horizon", () => {
    const out = upcomingOutflows({
      entries: [entry()],
      rules: [rule()],
      statuses: [],
      loans: [loan()],
      now: NOW,
      horizonDays: 7,
    });
    const kinds = out.map((o) => o.kind);
    expect(kinds).toContain("entry");
    expect(kinds).toContain("rule");
    expect(kinds).toContain("loan");
    // Sorted ascending by date.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].date.getTime()).toBeGreaterThanOrEqual(
        out[i - 1].date.getTime(),
      );
    }
  });

  it("skips paid recurring rules", () => {
    const r = rule();
    const status: RecurringStatus = {
      ruleId: r.id,
      monthKey: "2026-05",
      status: "paid",
    };
    const out = upcomingOutflows({
      entries: [],
      rules: [r],
      statuses: [status],
      loans: [],
      now: NOW,
      horizonDays: 7,
    });
    expect(out.find((o) => o.kind === "rule")).toBeUndefined();
  });

  it("skips inactive loans and rules", () => {
    const out = upcomingOutflows({
      entries: [],
      rules: [rule({ active: false })],
      statuses: [],
      loans: [loan({ active: false })],
      now: NOW,
      horizonDays: 7,
    });
    expect(out).toHaveLength(0);
  });

  it("excludes refunds + pending + needsConfirmation + excludeFromBudget", () => {
    const entries = [
      entry({ amount: 200, isRefund: true }),
      entry({ amount: 200, bankPending: true }),
      entry({ amount: 200, needsConfirmation: true }),
      entry({ amount: 200, excludeFromBudget: true }),
      entry({ amount: 250 }),
    ];
    const out = upcomingOutflows({
      entries,
      rules: [],
      statuses: [],
      loans: [],
      now: NOW,
      horizonDays: 7,
    });
    const entryRows = out.filter((o) => o.kind === "entry");
    expect(entryRows).toHaveLength(1);
    expect(entryRows[0].amount).toBe(250);
  });

  it("drops items outside the horizon window", () => {
    const out = upcomingOutflows({
      entries: [
        entry({
          chargeDate: new Date(2026, 5, 15).toISOString(),
          amount: 200,
        }),
      ],
      rules: [],
      statuses: [],
      loans: [],
      now: NOW,
      horizonDays: 7,
    });
    expect(out).toHaveLength(0);
  });

  it("computes daysUntil correctly (today = 0, tomorrow = 1)", () => {
    const out = upcomingOutflows({
      entries: [
        entry({
          chargeDate: new Date(2026, 4, 20, 14, 0).toISOString(),
          amount: 100,
        }),
        entry({
          chargeDate: new Date(2026, 4, 21, 9, 0).toISOString(),
          amount: 100,
        }),
      ],
      rules: [],
      statuses: [],
      loans: [],
      now: NOW,
      horizonDays: 7,
    });
    expect(out[0].daysUntil).toBe(0);
    expect(out[1].daysUntil).toBe(1);
  });
});
