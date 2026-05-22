import { describe, expect, it } from "vitest";

import {
  AUTO_APPLY_CONFIDENCE,
  AUTO_APPLY_MIN_SAMPLES,
  buildMerchantMemory,
  predictCategory,
  shouldAutoApply,
} from "@/lib/merchant-memory";
import type { ExpenseEntry } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: (o.category ?? "food") as CategoryId,
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-10T10:00:00.000Z",
    createdAt: "2026-05-10T10:00:00.000Z",
    merchant: o.merchant ?? "שופרסל",
    ...o,
  };
}

describe("buildMerchantMemory", () => {
  it("picks the majority category", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "ארומה", category: "food" }),
      entry({ merchant: "ארומה", category: "food" }),
      entry({ merchant: "ארומה", category: "entertainment" }),
    ]);
    const p = predictCategory(m, "ארומה");
    expect(p?.category).toBe("food");
    expect(p?.sampleSize).toBe(3);
    expect(p?.confidence).toBeCloseTo(2 / 3, 5);
  });

  it("normalizes merchant variants via merchantKey", () => {
    // "שופרסל" canonicalizes — branch suffixes don't change the key.
    const m = buildMerchantMemory([
      entry({ merchant: "שופרסל סניף 12", category: "food" }),
      entry({ merchant: "שופרסל סניף 7", category: "food" }),
    ]);
    const p = predictCategory(m, "שופרסל");
    expect(p?.sampleSize).toBe(2);
    expect(p?.category).toBe("food");
  });

  it("excludes needsConfirmation entries", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "X", category: "food", needsConfirmation: true }),
    ]);
    expect(predictCategory(m, "X")).toBeNull();
  });

  it("excludes excludeFromBudget entries", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "X", category: "food", excludeFromBudget: true }),
    ]);
    expect(predictCategory(m, "X")).toBeNull();
  });

  it("excludes refunds", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "X", category: "food", isRefund: true }),
    ]);
    expect(predictCategory(m, "X")).toBeNull();
  });

  it("returns null on unknown merchant", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "ארומה", category: "food" }),
    ]);
    expect(predictCategory(m, "Apple")).toBeNull();
  });

  it("returns null on empty merchant string", () => {
    const m = buildMerchantMemory([]);
    expect(predictCategory(m, "")).toBeNull();
  });

  it("confidence = 1.0 when every vote agrees", () => {
    const m = buildMerchantMemory([
      entry({ merchant: "Netflix", category: "entertainment" }),
      entry({ merchant: "Netflix", category: "entertainment" }),
    ]);
    const p = predictCategory(m, "Netflix");
    expect(p?.confidence).toBe(1);
  });

  it("tie-break is deterministic (smaller categoryId wins)", () => {
    // 1 vote each — smaller string wins. "bills" < "food".
    const m = buildMerchantMemory([
      entry({ merchant: "X", category: "food" }),
      entry({ merchant: "X", category: "bills" }),
    ]);
    const p = predictCategory(m, "X");
    expect(p?.category).toBe("bills");
  });
});

describe("shouldAutoApply", () => {
  it("requires both sample size + confidence", () => {
    expect(shouldAutoApply(null)).toBe(false);
    expect(
      shouldAutoApply({ category: "food", confidence: 1, sampleSize: 2 }),
    ).toBe(false); // too few samples
    expect(
      shouldAutoApply({
        category: "food",
        confidence: 0.6,
        sampleSize: 10,
      }),
    ).toBe(false); // confidence below 0.75
  });

  it("applies when both thresholds met", () => {
    expect(
      shouldAutoApply({
        category: "food",
        confidence: AUTO_APPLY_CONFIDENCE,
        sampleSize: AUTO_APPLY_MIN_SAMPLES,
      }),
    ).toBe(true);
  });
});
