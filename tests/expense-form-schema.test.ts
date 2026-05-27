// Phase 244 — schema verification.
//
// Ensures the manual-entry form forces a real source linkage:
// credit requires a card account id, bank requires a bank account
// id, cash is unconstrained. Without this gate the store
// silently swallows orphan expenses with no downstream forecast
// impact — exactly the "fake accounting" the brief calls out.

import { describe, expect, it } from "vitest";

import { expenseFormSchema } from "@/lib/schema";

const BASE = {
  amount: 100,
  category: "food" as const,
  installments: 1,
  note: undefined,
};

describe("expenseFormSchema", () => {
  it("accepts a valid cash expense with no accountId", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "cash",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a credit-card expense without accountId", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "card",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issues = r.error.issues.map((i) => i.path.join("."));
      expect(issues).toContain("accountId");
    }
  });

  it("accepts a credit-card expense with an accountId", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "card",
      accountId: "card-1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bank expense without accountId", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "bank",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issues = r.error.issues.map((i) => i.path.join("."));
      expect(issues).toContain("accountId");
    }
  });

  it("accepts a bank expense with an accountId", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "bank",
      accountId: "bank-1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when installments exceed 60", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "cash",
      installments: 61,
    });
    expect(r.success).toBe(false);
  });

  it("rejects when paymentSource is unrecognized", () => {
    const r = expenseFormSchema.safeParse({
      ...BASE,
      paymentSource: "wire",
    });
    expect(r.success).toBe(false);
  });
});
