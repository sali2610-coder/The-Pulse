import { describe, expect, it } from "vitest";

import { suggestCategory } from "@/lib/suggest-category";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string; merchant: string; category: ExpenseEntry["category"] }): ExpenseEntry {
  const { amount, iso, merchant, category, ...rest } = opts;
  return {
    id: `e-${iso}-${merchant}-${amount}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category,
    source: "manual",
    merchant,
    createdAt: iso,
    ...rest,
  };
}

function rule(opts: Partial<RecurringRule> & { id: string; label: string; category: RecurringRule["category"] }): RecurringRule {
  return {
    estimatedAmount: 50,
    dayOfMonth: 1,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...opts,
  };
}

describe("suggestCategory", () => {
  it("returns 'other' / low when no merchant + no history + no rules", () => {
    const s = suggestCategory({
      merchant: undefined,
      amount: 50,
      entries: [],
      rules: [],
    });
    expect(s.category).toBe("other");
    expect(s.confidence).toBe("low");
  });

  it("uses static categorize() for known merchant strings without history", () => {
    const s = suggestCategory({
      merchant: "ארומה",
      amount: 18,
      entries: [],
      rules: [],
    });
    expect(s.category).toBe("food");
    expect(s.confidence).toBe("medium");
  });

  it("HIGH confidence when 3+ unanimous priors for same canonical merchant", () => {
    const entries = [
      entry({ amount: 80, iso: "2026-05-01T10:00:00Z", merchant: "שופרסל סניף 12", category: "food" }),
      entry({ amount: 90, iso: "2026-05-08T10:00:00Z", merchant: "שופרסל", category: "food" }),
      entry({ amount: 70, iso: "2026-05-15T10:00:00Z", merchant: "שופרסל ראשון", category: "food" }),
    ];
    const s = suggestCategory({
      merchant: "שופרסל ר״ג",
      amount: 95,
      entries,
      rules: [],
    });
    expect(s.category).toBe("food");
    expect(s.confidence).toBe("high");
  });

  it("MEDIUM when 3+ priors but split categories", () => {
    const entries = [
      entry({ amount: 80, iso: "2026-05-01T10:00:00Z", merchant: "Shop", category: "shopping" }),
      entry({ amount: 90, iso: "2026-05-08T10:00:00Z", merchant: "Shop", category: "shopping" }),
      entry({ amount: 70, iso: "2026-05-15T10:00:00Z", merchant: "Shop", category: "food" }),
    ];
    const s = suggestCategory({
      merchant: "Shop",
      amount: 50,
      entries,
      rules: [],
    });
    expect(s.confidence).toBe("medium");
  });

  it("LOW confidence when 1-2 priors only", () => {
    const entries = [
      entry({ amount: 80, iso: "2026-05-01T10:00:00Z", merchant: "Niche", category: "gifts" }),
    ];
    const s = suggestCategory({
      merchant: "Niche",
      amount: 50,
      entries,
      rules: [],
    });
    expect(s.category).toBe("gifts");
    expect(s.confidence).toBe("low");
  });

  it("linked rule trumps everything else", () => {
    const r = rule({
      id: "rule-netflix",
      label: "Netflix",
      category: "entertainment",
      keywords: ["netflix"],
      estimatedAmount: 60,
    });
    const entries = [
      entry({ amount: 60, iso: "2026-05-01T10:00:00Z", merchant: "netflix", category: "bills" }),
      entry({ amount: 60, iso: "2026-04-01T10:00:00Z", merchant: "netflix", category: "bills" }),
      entry({ amount: 60, iso: "2026-03-01T10:00:00Z", merchant: "netflix", category: "bills" }),
    ];
    const s = suggestCategory({
      merchant: "Netflix.com",
      amount: 60,
      entries,
      rules: [r],
    });
    expect(s.category).toBe("entertainment");
    expect(s.confidence).toBe("high");
    expect(s.reason).toContain("Netflix");
  });

  it("ignores refunds and pending entries in history", () => {
    const entries = [
      entry({
        amount: 999,
        iso: "2026-05-01T10:00:00Z",
        merchant: "Sushi",
        category: "shopping",
        isRefund: true,
      }),
      entry({
        amount: 999,
        iso: "2026-05-02T10:00:00Z",
        merchant: "Sushi",
        category: "gifts",
        needsConfirmation: true,
      }),
    ];
    const s = suggestCategory({
      merchant: "Sushi Tel Aviv",
      amount: 80,
      entries,
      rules: [],
    });
    // Both priors filtered out → falls through to static heuristic
    // which doesn't know "sushi" → returns "other"/low.
    expect(["other", "food"]).toContain(s.category);
  });

  it("inactive rules don't match", () => {
    const r = rule({
      id: "rule-off",
      label: "Gym",
      category: "health",
      keywords: ["gym"],
      active: false,
    });
    const s = suggestCategory({
      merchant: "gym tlv",
      amount: 100,
      entries: [],
      rules: [r],
    });
    expect(s.reason).not.toContain("Gym");
  });

  it("Phase 215 — corrections fold into the modal vote", () => {
    // One past entry categorised as shopping; three explicit user
    // corrections flagging it as food. Engine should now suggest
    // food (3 × +2 weight vs 1 raw vote for shopping).
    const past = entry({
      id: "e-1",
      amount: 100,
      iso: "2026-05-01T10:00:00Z",
      merchant: "שופרסל",
      category: "shopping",
    });
    const s = suggestCategory({
      merchant: "שופרסל סניף",
      amount: 80,
      entries: [past],
      rules: [],
      corrections: [
        {
          id: "c1",
          targetId: "e-1",
          targetKind: "entry",
          kind: "wrong_category",
          suggestedCategory: "food",
          at: "2026-05-02T00:00:00Z",
        },
        {
          id: "c2",
          targetId: "e-1",
          targetKind: "entry",
          kind: "wrong_category",
          suggestedCategory: "food",
          at: "2026-05-03T00:00:00Z",
        },
      ],
    });
    expect(s.category).toBe("food");
    expect(s.reason).toContain("תיקונים");
  });

  it("Phase 215 — corrections for a different merchant don't leak", () => {
    const past = entry({
      id: "e-aroma",
      amount: 30,
      iso: "2026-05-01T10:00:00Z",
      merchant: "ארומה",
      category: "food",
    });
    const s = suggestCategory({
      // Use a merchant the static categorize() table doesn't
      // recognise, so we can be sure the suggestion didn't come from
      // a leaked correction.
      merchant: "Random Studio XYZ",
      amount: 50,
      entries: [past],
      rules: [],
      corrections: [
        {
          id: "c1",
          targetId: "e-aroma",
          targetKind: "entry",
          kind: "wrong_category",
          suggestedCategory: "entertainment",
          at: "2026-05-02T00:00:00Z",
        },
      ],
    });
    // No history match, no correction match → static categorize on
    // unknown merchant → "other".
    expect(s.category).toBe("other");
    expect(s.reason).not.toContain("תיקונים");
  });
});
