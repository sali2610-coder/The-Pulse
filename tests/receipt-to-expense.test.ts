import { describe, expect, it } from "vitest";

import { buildExpenseFromReceipt } from "@/lib/ocr/receipt-to-expense";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import type { ReceiptCandidate } from "@/lib/ocr";

function makeEntry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    ...o,
  };
}

describe("buildExpenseFromReceipt", () => {
  it("returns missing_amount when parser couldn't find a number", () => {
    const c: ReceiptCandidate = { confident: false, merchant: "Shufersal" };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing_amount");
  });

  it("rejects non-positive amounts", () => {
    const c: ReceiptCandidate = { confident: true, amount: 0, merchant: "X" };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("non_positive_amount");
  });

  it("falls back to a placeholder merchant when none was detected", () => {
    const c: ReceiptCandidate = { confident: false, amount: 42.9 };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.draft.merchant).toBe("קבלה ללא שם");
  });

  it("uses candidate.occurredAt when present, otherwise now()", () => {
    const c1: ReceiptCandidate = {
      confident: true,
      amount: 50,
      merchant: "X",
      occurredAt: "2026-04-01T12:00:00.000Z",
    };
    const r1 = buildExpenseFromReceipt({
      candidate: c1,
      entries: [],
      rules: [],
    });
    if (!r1.ok) throw new Error("ok");
    expect(r1.draft.chargeDate).toBe("2026-04-01T12:00:00.000Z");

    const now = new Date("2026-05-25T08:00:00.000Z");
    const c2: ReceiptCandidate = { confident: true, amount: 50, merchant: "X" };
    const r2 = buildExpenseFromReceipt({
      candidate: c2,
      entries: [],
      rules: [],
      now,
    });
    if (!r2.ok) throw new Error("ok");
    expect(r2.draft.chargeDate).toBe(now.toISOString());
  });

  it("learns category from prior entries via suggestCategory", () => {
    const entries = [
      makeEntry({ merchant: "שופרסל", category: "food" }),
      makeEntry({ merchant: "שופרסל", category: "food" }),
      makeEntry({ merchant: "שופרסל", category: "food" }),
    ];
    const c: ReceiptCandidate = {
      confident: true,
      amount: 99,
      merchant: "שופרסל",
    };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries,
      rules: [],
    });
    if (!out.ok) throw new Error("ok");
    expect(out.draft.category).toBe("food");
    expect(out.draft.suggestionConfidence).toBe("high");
  });

  it("adds a [USD] note for foreign-currency receipts", () => {
    const c: ReceiptCandidate = {
      confident: true,
      amount: 12,
      merchant: "Amazon",
      currency: "USD",
    };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
    });
    if (!out.ok) throw new Error("ok");
    expect(out.draft.note).toBe("[USD]");
  });

  it("rules contribute via suggestCategory linked-rule branch", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "סלקום",
        category: "bills",
        estimatedAmount: 120,
        dayOfMonth: 5,
        keywords: ["סלקום"],
        active: true,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ];
    const c: ReceiptCandidate = {
      confident: true,
      amount: 120,
      merchant: "סלקום",
    };
    const out = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules,
    });
    if (!out.ok) throw new Error("ok");
    expect(out.draft.category).toBe("bills");
    expect(out.draft.suggestionConfidence).toBe("high");
  });

  it("defaults paymentMethod to credit but accepts override", () => {
    const c: ReceiptCandidate = {
      confident: true,
      amount: 30,
      merchant: "Cafe",
    };
    const def = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
    });
    if (!def.ok) throw new Error("ok");
    expect(def.draft.paymentMethod).toBe("credit");

    const cash = buildExpenseFromReceipt({
      candidate: c,
      entries: [],
      rules: [],
      paymentMethod: "cash",
    });
    if (!cash.ok) throw new Error("ok");
    expect(cash.draft.paymentMethod).toBe("cash");
  });
});
