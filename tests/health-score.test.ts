import { describe, expect, it } from "vitest";
import { buildHealthScore } from "@/lib/health-score";
import type { Account } from "@/types/finance";

function bank(label: string, balance: number): Account {
  return {
    id: `bank-${label}`,
    kind: "bank",
    label,
    anchorBalance: balance,
    anchorUpdatedAt: new Date(2026, 4, 1).toISOString(),
    active: true,
    createdAt: new Date(2026, 4, 1).toISOString(),
  };
}

const NOW = new Date(2026, 4, 15, 12, 0, 0);

describe("buildHealthScore", () => {
  it("returns a great tone when everything is in order", () => {
    const h = buildHealthScore({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [bank("main", 10000)],
      loans: [],
      incomes: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(h.tone).toBe("great");
    expect(h.score).toBeGreaterThanOrEqual(80);
  });

  it("returns a danger tone when forecast goes deeply negative", () => {
    const h = buildHealthScore({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [bank("main", -5000)],
      loans: [],
      incomes: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(h.tone === "danger" || h.tone === "watch").toBe(true);
    expect(h.score).toBeLessThanOrEqual(55);
  });

  it("falls back to neutral when no bank account or budget is configured", () => {
    const h = buildHealthScore({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [],
      loans: [],
      incomes: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    // forecast 60, budget 60, anomalies 100, pace 60 → ~67 weighted.
    expect(h.score).toBeGreaterThan(50);
    expect(h.score).toBeLessThan(80);
  });

  it("penalizes anomalies in the anomaly sub-score", () => {
    // Each merchant: 2 modest baseline charges + 1 anomaly. 5 merchants =
    // 5 anomalies expected, well above the 0 threshold.
    const entries = Array.from({ length: 5 }).flatMap((_, i) => {
      return [
        {
          id: `b${i}-1`,
          amount: 100,
          category: "food" as const,
          source: "manual" as const,
          paymentMethod: "credit" as const,
          installments: 1,
          chargeDate: new Date(2026, 2, 5).toISOString(),
          createdAt: new Date(2026, 2, 5).toISOString(),
          merchant: `M${i}`,
        },
        {
          id: `b${i}-2`,
          amount: 100,
          category: "food" as const,
          source: "manual" as const,
          paymentMethod: "credit" as const,
          installments: 1,
          chargeDate: new Date(2026, 3, 5).toISOString(),
          createdAt: new Date(2026, 3, 5).toISOString(),
          merchant: `M${i}`,
        },
        {
          id: `x${i}`,
          amount: 400,
          category: "food" as const,
          source: "manual" as const,
          paymentMethod: "credit" as const,
          installments: 1,
          chargeDate: new Date(2026, 4, 5).toISOString(),
          createdAt: new Date(2026, 4, 5).toISOString(),
          merchant: `M${i}`,
        },
      ];
    });
    const h = buildHealthScore({
      entries,
      rules: [],
      statuses: [],
      accounts: [bank("main", 10000)],
      loans: [],
      incomes: [],
      monthlyBudget: 0,
      monthKey: "2026-05",
      now: NOW,
    });
    expect(h.sub.anomalies).toBeLessThan(60);
  });
});
