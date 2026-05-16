import { describe, expect, it } from "vitest";
import { topMerchants } from "@/lib/merchants";
import type { ExpenseEntry } from "@/types/finance";

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    merchant: "Shufersal",
    ...overrides,
  };
}

describe("topMerchants", () => {
  it("aggregates per-merchant totals + counts and sorts descending", () => {
    const entries: ExpenseEntry[] = [
      entry({ merchant: "Shufersal", amount: 200 }),
      entry({ merchant: "Shufersal", amount: 150 }),
      entry({ merchant: "Cofix", category: "food", amount: 30 }),
    ];
    const out = topMerchants({ entries, monthKey: "2026-05" });
    expect(out.length).toBe(2);
    expect(out[0].merchant).toBe("Shufersal");
    expect(out[0].total).toBe(350);
    expect(out[0].count).toBe(2);
    expect(out[1].merchant).toBe("Cofix");
  });

  it("treats noisy branch variants as the same merchant via merchantKey", () => {
    const entries: ExpenseEntry[] = [
      entry({ merchant: "שופרסל", amount: 100 }),
      entry({ merchant: "שופרסל סניף 123", amount: 200 }),
    ];
    const out = topMerchants({ entries, monthKey: "2026-05" });
    expect(out.length).toBe(1);
    expect(out[0].total).toBe(300);
    expect(out[0].count).toBe(2);
  });

  it("skips needsConfirmation / bankPending / refund / FX / no-merchant entries", () => {
    const entries: ExpenseEntry[] = [
      entry({ merchant: "Shufersal", needsConfirmation: true }),
      entry({ merchant: "Shufersal", bankPending: true }),
      entry({ merchant: "Shufersal", isRefund: true }),
      entry({ merchant: "Shufersal", currency: "USD" }),
      entry({ merchant: undefined, amount: 500 }),
      entry({ merchant: "Cofix", amount: 50 }),
    ];
    const out = topMerchants({ entries, monthKey: "2026-05" });
    expect(out.length).toBe(1);
    expect(out[0].merchant).toBe("Cofix");
  });

  it("uses per-month slice for installment entries", () => {
    const entries: ExpenseEntry[] = [
      entry({
        merchant: "iPhone Plan",
        amount: 1200,
        installments: 12,
        chargeDate: new Date(2026, 0, 5).toISOString(),
      }),
    ];
    const out = topMerchants({ entries, monthKey: "2026-05" });
    expect(out[0].total).toBe(100);
  });

  it("clamps the limit to [1, 50]", () => {
    const entries: ExpenseEntry[] = Array.from({ length: 8 }).map((_, i) =>
      entry({ merchant: `M${i}`, amount: 100 - i }),
    );
    const out = topMerchants({ entries, monthKey: "2026-05", limit: 3 });
    expect(out.length).toBe(3);
    expect(out[0].merchant).toBe("M0");
  });
});
