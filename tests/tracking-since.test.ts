import { describe, expect, it } from "vitest";

import { computeTrackingSince } from "@/lib/tracking-since";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 4, 20);

function entry(createdAt: string): ExpenseEntry {
  return {
    id: createdAt,
    amount: 0,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: createdAt,
    createdAt,
  };
}

describe("computeTrackingSince", () => {
  it("returns null when there is no history", () => {
    expect(
      computeTrackingSince({
        entries: [],
        rules: [],
        loans: [],
        accounts: [],
        incomes: [],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("finds the earliest createdAt across every entity type", () => {
    const out = computeTrackingSince({
      entries: [entry("2026-05-15T00:00:00.000Z")],
      rules: [
        {
          id: "r",
          label: "x",
          category: "bills",
          estimatedAmount: 0,
          dayOfMonth: 1,
          keywords: [],
          active: true,
          createdAt: "2025-12-01T00:00:00.000Z",
        } as RecurringRule,
      ],
      loans: [],
      accounts: [
        {
          id: "a",
          kind: "bank",
          label: "bank",
          active: true,
          createdAt: "2025-08-01T00:00:00.000Z",
        } as Account,
      ],
      incomes: [],
      now: NOW,
    });
    expect(out?.startedAt).toBe("2025-08-01T00:00:00.000Z");
    expect(out?.months).toBeGreaterThanOrEqual(9);
  });

  it("ignores invalid timestamps", () => {
    const out = computeTrackingSince({
      entries: [entry("not-a-date"), entry("2026-04-01T00:00:00.000Z")],
      rules: [],
      loans: [],
      accounts: [],
      incomes: [],
      now: NOW,
    });
    expect(out?.startedAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("computes totalDays from now back to start", () => {
    const start = new Date("2026-04-20T00:00:00.000Z");
    const exactlyThirtyLater = new Date(
      start.getTime() + 30 * 86_400_000,
    );
    const out = computeTrackingSince({
      entries: [entry(start.toISOString())],
      rules: [],
      loans: [],
      accounts: [],
      incomes: [],
      now: exactlyThirtyLater,
    });
    expect(out?.totalDays).toBe(30);
    expect(out?.months).toBe(1);
  });

  it("loans createdAt also feeds the earliest computation", () => {
    const out = computeTrackingSince({
      entries: [],
      rules: [],
      loans: [
        {
          id: "l",
          label: "loan",
          monthlyInstallment: 0,
          dayOfMonth: 1,
          active: true,
          createdAt: "2025-06-01T00:00:00.000Z",
        } as Loan,
      ],
      accounts: [],
      incomes: [],
      now: NOW,
    });
    expect(out?.startedAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("incomes createdAt also feeds the earliest computation", () => {
    const out = computeTrackingSince({
      entries: [],
      rules: [],
      loans: [],
      accounts: [],
      incomes: [
        {
          id: "i",
          label: "salary",
          amount: 100,
          dayOfMonth: 1,
          active: true,
          createdAt: "2025-07-01T00:00:00.000Z",
        } as Income,
      ],
      now: NOW,
    });
    expect(out?.startedAt).toBe("2025-07-01T00:00:00.000Z");
  });
});
