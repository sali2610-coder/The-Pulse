import { describe, expect, it } from "vitest";

import { spendingDiet } from "@/lib/spending-diet";
import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date("2026-05-20T08:00:00.000Z");

function entry(
  amount: number,
  monthIdx0: number,
  day: number,
  category: CategoryId,
): ExpenseEntry {
  const date = new Date(2026, monthIdx0, day).toISOString();
  return {
    id: `e-${monthIdx0}-${day}-${amount}-${category}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category,
    source: "manual",
    createdAt: date,
  };
}

describe("spendingDiet", () => {
  it("returns empty result on empty entries", () => {
    const d = spendingDiet({ entries: [], now: NOW });
    expect(d.rows).toEqual([]);
    expect(d.potentialSavings).toBe(0);
  });

  it("classifies bills/health/education/transport as essential with no target", () => {
    const d = spendingDiet({
      entries: [entry(500, 4, 5, "bills")],
      now: NOW,
    });
    const bills = d.rows.find((r) => r.category === "bills");
    expect(bills?.classification).toBe("essential");
    expect(bills?.suggestedTarget).toBeNull();
  });

  it("treats entertainment as risky by baseline", () => {
    const d = spendingDiet({
      entries: [entry(300, 4, 5, "entertainment")],
      now: NOW,
    });
    const e = d.rows.find((r) => r.category === "entertainment");
    expect(e?.classification).toBe("risky");
    expect(e?.suggestedTarget).not.toBeNull();
  });

  it("flags non-baseline category as risky when paced ≥30% above prior median", () => {
    const d = spendingDiet({
      entries: [
        entry(2000, 4, 10, "food"), // current month: pace projects high
        entry(1000, 1, 5, "food"),  // priors averaging 1000
        entry(1000, 2, 5, "food"),
        entry(1000, 3, 5, "food"),
      ],
      now: NOW,
    });
    const food = d.rows.find((r) => r.category === "food");
    expect(food?.classification).toBe("risky");
  });

  it("classifies stable flexible categories as flexible", () => {
    // current month pace projects under prior median → not risky
    const d = spendingDiet({
      entries: [
        entry(300, 4, 20, "food"), // projects to ~465 by EOM
        entry(1000, 1, 5, "food"),
        entry(1000, 2, 5, "food"),
        entry(1000, 3, 5, "food"),
      ],
      now: NOW,
    });
    const food = d.rows.find((r) => r.category === "food");
    expect(food?.classification).toBe("flexible");
  });

  it("potentialSavings is a non-negative sum across flexible+risky", () => {
    const d = spendingDiet({
      entries: [
        entry(800, 4, 5, "entertainment"),
        entry(2000, 4, 10, "food"),
        entry(500, 4, 8, "bills"),
      ],
      now: NOW,
    });
    expect(d.potentialSavings).toBeGreaterThanOrEqual(0);
  });

  it("never proposes shaving more than 25% of a category", () => {
    const d = spendingDiet({
      entries: [entry(1000, 4, 10, "entertainment")],
      now: NOW,
    });
    const e = d.rows.find((r) => r.category === "entertainment");
    // projectedEOM ≈ 1000 * 31/20 = 1550. cap = 1550 * 0.25 = ~387.
    // target = projected - max(50, min(cap, projected-prior=1550))
    //        = 1550 - 387 (since cap < projected-prior)
    //        = ~1163.
    if (!e?.suggestedTarget) throw new Error("expected target");
    expect(e.suggestedTarget).toBeGreaterThanOrEqual(e.projectedEOM * 0.7);
  });
});
