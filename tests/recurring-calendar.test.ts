import { describe, expect, it } from "vitest";

import { recurringCalendar } from "@/lib/recurring-calendar";
import type {
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: o.label ?? "חשמל",
    category: "bills",
    estimatedAmount: 300,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? "l1",
    label: "car",
    monthlyInstallment: 1500,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "i1",
    label: "salary",
    amount: 18000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("recurringCalendar", () => {
  it("returns N days starting at `now` (midnight)", () => {
    const out = recurringCalendar({
      rules: [],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 1, 12, 0, 0),
      days: 7,
    });
    expect(out).toHaveLength(7);
    // First day index 0 → May 1; last index 6 → May 7.
    expect(out[0].date.getDate()).toBe(1);
    expect(out[6].date.getDate()).toBe(7);
  });

  it("includes empty days with empty items arrays", () => {
    const out = recurringCalendar({
      rules: [rule({ dayOfMonth: 10 })],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 1, 12, 0, 0),
      days: 5,
    });
    // Window May 1-5; rule fires May 10 → outside.
    expect(out.every((d) => d.items.length === 0)).toBe(true);
  });

  it("picks up a rule firing inside the window", () => {
    const out = recurringCalendar({
      rules: [rule({ dayOfMonth: 5 })],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 1, 12, 0, 0),
      days: 10,
    });
    const day5 = out.find((d) => d.date.getDate() === 5)!;
    expect(day5.items).toHaveLength(1);
    expect(day5.outflow).toBe(300);
  });

  it("respects month rollover (window spans May → June)", () => {
    const out = recurringCalendar({
      rules: [rule({ id: "r1", dayOfMonth: 28 })],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 25, 12, 0, 0),
      days: 14, // May 25 → June 7
    });
    // Hits May 28 + nothing in early June (rule fires once per
    // month on day 28).
    const mayHit = out.find(
      (d) => d.date.getMonth() === 4 && d.date.getDate() === 28,
    )!;
    expect(mayHit.items).toHaveLength(1);
    // Window doesn't reach next rule firing (June 28).
    const totalHits = out.reduce((n, d) => n + d.items.length, 0);
    expect(totalHits).toBe(1);
  });

  it("buckets loan + rule + income on the same day", () => {
    const out = recurringCalendar({
      rules: [rule({ id: "r1", dayOfMonth: 1, estimatedAmount: 200 })],
      loans: [loan({ dayOfMonth: 1, monthlyInstallment: 1500 })],
      incomes: [income({ dayOfMonth: 1, amount: 18000 })],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 1, 12, 0, 0),
      days: 3,
    });
    const day1 = out[0];
    expect(day1.items).toHaveLength(3);
    expect(day1.outflow).toBe(1700); // 200 + 1500
    expect(day1.income).toBe(18000);
  });

  it("income signed positive on income field; never in outflow", () => {
    const out = recurringCalendar({
      rules: [],
      loans: [],
      incomes: [income({ dayOfMonth: 3, amount: 5000 })],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 1, 12, 0, 0),
      days: 7,
    });
    const day3 = out.find((d) => d.date.getDate() === 3)!;
    expect(day3.income).toBe(5000);
    expect(day3.outflow).toBe(0);
  });

  it("excludes events before `now`", () => {
    // Rule day 5; now = May 10 → rule already fired this month;
    // window May 10-19 picks NOTHING (next firing June 5 is outside).
    const out = recurringCalendar({
      rules: [rule({ dayOfMonth: 5 })],
      loans: [],
      incomes: [],
      entries: [],
      statuses: [],
      now: new Date(2026, 4, 10, 12, 0, 0),
      days: 10,
    });
    expect(out.reduce((n, d) => n + d.items.length, 0)).toBe(0);
  });
});
