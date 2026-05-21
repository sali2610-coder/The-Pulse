import { describe, expect, it } from "vitest";

import { buildBillingCalendar } from "@/lib/billing-calendar";
import type {
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MAY: MonthKey = "2026-05";

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "Electricity",
    category: "bills",
    estimatedAmount: 350,
    dayOfMonth: 10,
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
    endDate: "2029-12-01",
    dayOfMonth: 25,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildBillingCalendar", () => {
  it("emits one entry per day of the month", () => {
    const days = buildBillingCalendar({
      rules: [],
      loans: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(days).toHaveLength(31);
    expect(days[0].day).toBe(1);
    expect(days[30].day).toBe(31);
    expect(days.every((d) => d.total === 0 && d.items.length === 0)).toBe(true);
  });

  it("places a rule on its dayOfMonth", () => {
    const days = buildBillingCalendar({
      rules: [rule()],
      loans: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(days[9].total).toBe(350);
    expect(days[9].items).toHaveLength(1);
    expect(days[9].items[0].kind).toBe("rule");
    expect(days[9].items[0].status).toBe("pending");
  });

  it("marks a rule paid when there's a matching status", () => {
    const statuses: RecurringStatus[] = [
      { ruleId: "r1", monthKey: MAY, status: "paid" },
    ];
    const days = buildBillingCalendar({
      rules: [rule()],
      loans: [],
      statuses,
      monthKey: MAY,
    });
    expect(days[9].items[0].status).toBe("paid");
  });

  it("places loans on their dayOfMonth", () => {
    const days = buildBillingCalendar({
      rules: [],
      loans: [loan()],
      statuses: [],
      monthKey: MAY,
    });
    expect(days[24].total).toBe(1500);
    expect(days[24].items[0].kind).toBe("loan");
  });

  it("clamps a dayOfMonth>monthLen to the last day", () => {
    // February has 28 days in 2026.
    const days = buildBillingCalendar({
      rules: [rule({ dayOfMonth: 31 })],
      loans: [],
      statuses: [],
      monthKey: "2026-02",
    });
    expect(days[days.length - 1].items).toHaveLength(1);
  });

  it("skips inactive rules + loans", () => {
    const days = buildBillingCalendar({
      rules: [rule({ active: false })],
      loans: [loan({ active: false })],
      statuses: [],
      monthKey: MAY,
    });
    expect(days.every((d) => d.items.length === 0)).toBe(true);
  });

  it("skips past-end installment rules", () => {
    const days = buildBillingCalendar({
      rules: [
        rule({
          installmentTotal: 12,
          startMonth: 1,
          startYear: 2024,
        }),
      ],
      loans: [],
      statuses: [],
      monthKey: MAY,
    });
    expect(days.every((d) => d.items.length === 0)).toBe(true);
  });
});
