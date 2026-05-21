import { describe, expect, it } from "vitest";

import { cardUtilization } from "@/lib/card-utilization";
import type { CardCycleProjection } from "@/lib/card-cycle";
import type { Account } from "@/types/finance";

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: "card-1",
    kind: "card",
    label: "CAL",
    issuer: "cal",
    cardLast4: "1234",
    billingDay: 25,
    paymentDay: 2,
    creditLimit: 10000,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function projection(amount: number): CardCycleProjection {
  return {
    accountId: "card-1",
    cycleStart: new Date(2026, 3, 26),
    cycleEnd: new Date(2026, 4, 25),
    daysUntilClose: 5,
    projectedAmount: amount,
    entryCount: 1,
  };
}

describe("cardUtilization", () => {
  it("returns null for non-card accounts", () => {
    expect(cardUtilization({ account: card({ kind: "bank" }) })).toBeNull();
  });

  it("returns null when no creditLimit is set", () => {
    expect(
      cardUtilization({ account: card({ creditLimit: undefined }) }),
    ).toBeNull();
  });

  it("prefers currentDebt over cycle projection", () => {
    const u = cardUtilization({
      account: card({ currentDebt: 6000 }),
      cycleProjection: projection(2000),
    })!;
    expect(u.used).toBe(6000);
    expect(u.source).toBe("debt");
    expect(u.ratio).toBeCloseTo(0.6, 2);
    expect(u.severity).toBe("watch");
  });

  it("falls back to cycle projection when no debt is tracked", () => {
    const u = cardUtilization({
      account: card(),
      cycleProjection: projection(7500),
    })!;
    expect(u.used).toBe(7500);
    expect(u.source).toBe("cycle");
    expect(u.severity).toBe("warn");
  });

  it("classifies 0% as calm", () => {
    const u = cardUtilization({ account: card() })!;
    expect(u.used).toBe(0);
    expect(u.ratio).toBe(0);
    expect(u.severity).toBe("calm");
  });

  it("classifies > 90% as alert and allows ratio > 1", () => {
    const u = cardUtilization({
      account: card({ currentDebt: 12000 }),
    })!;
    expect(u.ratio).toBeGreaterThan(1);
    expect(u.severity).toBe("alert");
  });

  it("severity bands: calm <50%, watch 50-70%, warn 70-90%, alert ≥90%", () => {
    const cases: Array<[number, string]> = [
      [3000, "calm"],
      [5500, "watch"],
      [8000, "warn"],
      [9500, "alert"],
    ];
    for (const [debt, expected] of cases) {
      const u = cardUtilization({ account: card({ currentDebt: debt }) })!;
      expect(u.severity).toBe(expected);
    }
  });
});
