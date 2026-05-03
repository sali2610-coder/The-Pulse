import { describe, expect, it } from "vitest";
import { findFuzzyDuplicate } from "@/lib/dedup";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
    amount: 150.5,
    category: "food",
    source: "auto",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 3, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 3, 12, 0, 0).toISOString(),
    issuer: "cal",
    cardLast4: "1234",
    merchant: "שופרסל",
    ...overrides,
  };
}

describe("findFuzzyDuplicate", () => {
  it("matches the same charge across SMS + CSV ingestion paths", () => {
    const sms = entry({ id: "sms", externalId: "sms:abc" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 3, 14, 30, 0).toISOString(),
      merchant: "שופרסל סניף 12",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])?.id).toBe("sms");
  });

  it("tolerates ±2 day posting drift", () => {
    const sms = entry({ id: "sms" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 5, 0, 0, 0).toISOString(),
      merchant: "שופרסל",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])?.id).toBe("sms");
  });

  it("rejects matches more than 2 days apart", () => {
    const sms = entry({ id: "sms" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 7).toISOString(),
      merchant: "שופרסל",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])).toBeUndefined();
  });

  it("rejects matches with different cardLast4", () => {
    const sms = entry({ id: "sms", cardLast4: "1234" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 3).toISOString(),
      merchant: "שופרסל",
      cardLast4: "5678",
    };
    expect(findFuzzyDuplicate(csv, [sms])).toBeUndefined();
  });

  it("rejects different merchants", () => {
    const sms = entry({ id: "sms", merchant: "שופרסל" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 3).toISOString(),
      merchant: "פז",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])).toBeUndefined();
  });

  it("matches when merchant has noisy branch info", () => {
    const sms = entry({ id: "sms", merchant: "שופרסל" });
    const csv = {
      amount: 150.5,
      chargeDate: new Date(2026, 4, 3).toISOString(),
      merchant: "שופרסל דיל סניף 123",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])?.id).toBe("sms");
  });

  it("allows ±1₪ rounding tolerance for small charges", () => {
    const sms = entry({ id: "sms", amount: 49.9 });
    const csv = {
      amount: 50.0, // 0.10₪ off → within tolerance
      chargeDate: new Date(2026, 4, 3).toISOString(),
      merchant: "שופרסל",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])?.id).toBe("sms");
  });

  it("rejects charges differing by more than tolerance", () => {
    const sms = entry({ id: "sms", amount: 50 });
    const csv = {
      amount: 100,
      chargeDate: new Date(2026, 4, 3).toISOString(),
      merchant: "שופרסל",
      cardLast4: "1234",
    };
    expect(findFuzzyDuplicate(csv, [sms])).toBeUndefined();
  });
});
