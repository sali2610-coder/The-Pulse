// Pure-logic test for the recurring-rules grouping rule.
// Mirrors the bucket selector in recurring-rules-panel.tsx so we can
// lock the policy in.

import { describe, expect, it } from "vitest";

import type { RecurringRule } from "@/types/finance";

type GroupKey = "installments" | "card" | "bank" | "cash" | "unknown";

function pickGroup(r: RecurringRule): GroupKey {
  // Phase 152d policy — paymentSource OUTRANKS installmentTotal.
  return r.paymentSource === "card"
    ? "card"
    : r.paymentSource === "bank"
      ? "bank"
      : r.paymentSource === "cash"
        ? "cash"
        : r.installmentTotal
          ? "installments"
          : "unknown";
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "test",
    category: "other",
    estimatedAmount: 100,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("recurring-rule grouping (Phase 152d)", () => {
  it("card-linked installment plan → card group, NOT installments", () => {
    const r = rule({
      paymentSource: "card",
      linkedCardId: "c1",
      installmentTotal: 5,
      estimatedAmount: 387,
      label: "צמיגים",
    });
    expect(pickGroup(r)).toBe("card");
  });

  it("card-linked regular recurring → card group", () => {
    const r = rule({ paymentSource: "card", linkedCardId: "c1" });
    expect(pickGroup(r)).toBe("card");
  });

  it("bank-linked installment plan → bank group", () => {
    const r = rule({ paymentSource: "bank", installmentTotal: 12 });
    expect(pickGroup(r)).toBe("bank");
  });

  it("cash-linked regular recurring → cash group", () => {
    const r = rule({ paymentSource: "cash" });
    expect(pickGroup(r)).toBe("cash");
  });

  it("installment with NO payment source → installments group (legacy)", () => {
    const r = rule({ installmentTotal: 6, paymentSource: undefined });
    expect(pickGroup(r)).toBe("installments");
  });

  it("payment source 'unknown' + installment → installments group", () => {
    const r = rule({ paymentSource: "unknown", installmentTotal: 6 });
    expect(pickGroup(r)).toBe("installments");
  });

  it("regular bill with no payment source → unknown group", () => {
    const r = rule({ paymentSource: undefined });
    expect(pickGroup(r)).toBe("unknown");
  });
});
