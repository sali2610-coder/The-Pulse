import { describe, expect, it } from "vitest";

import { searchEntries } from "@/lib/entry-search";
import type { ExpenseEntry } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
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

describe("searchEntries", () => {
  it("empty query → no results", () => {
    const hits = searchEntries(
      [entry({ merchant: "ארומה" })],
      "",
    );
    expect(hits).toEqual([]);
  });

  it("ranks exact merchant match above contains", () => {
    const hits = searchEntries(
      [
        entry({ id: "contains", merchant: "ארומה אספרסו בר" }),
        entry({ id: "exact", merchant: "ארומה" }),
      ],
      "ארומה",
    );
    expect(hits[0].entry.id).toBe("exact");
    expect(hits[0].score).toBe(3);
  });

  it("matches cardLast4 exactly", () => {
    const hits = searchEntries(
      [entry({ cardLast4: "1234", merchant: "Apple" })],
      "1234",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].score).toBe(2);
  });

  it("matches category label", () => {
    const hits = searchEntries(
      [entry({ category: "food", merchant: "x" })],
      "אוכל",
    );
    expect(hits).toHaveLength(1);
  });

  it("matches note via contains", () => {
    const hits = searchEntries(
      [entry({ note: "ארוחה עם הצוות" })],
      "ארוחה",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].score).toBe(1);
  });

  it("case-insensitive", () => {
    const hits = searchEntries(
      [entry({ merchant: "Netflix" })],
      "netflix",
    );
    expect(hits).toHaveLength(1);
  });

  it("ties broken by chargeDate DESC", () => {
    const hits = searchEntries(
      [
        entry({
          id: "older",
          merchant: "ארומה",
          chargeDate: "2026-04-01T12:00:00.000Z",
        }),
        entry({
          id: "newer",
          merchant: "ארומה",
          chargeDate: "2026-05-10T12:00:00.000Z",
        }),
      ],
      "ארומה",
    );
    expect(hits[0].entry.id).toBe("newer");
    expect(hits[1].entry.id).toBe("older");
  });

  it("limit caps result count", () => {
    const list = Array.from({ length: 100 }, (_, i) =>
      entry({ id: `e${i}`, merchant: "ארומה" }),
    );
    const hits = searchEntries(list, "ארומה", { limit: 5 });
    expect(hits).toHaveLength(5);
  });

  it("excludeRefunds option filters them out", () => {
    const hits = searchEntries(
      [
        entry({ id: "r", merchant: "ארומה", isRefund: true }),
        entry({ id: "n", merchant: "ארומה" }),
      ],
      "ארומה",
      { excludeRefunds: true },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].entry.id).toBe("n");
  });

  it("no hits when query matches nothing", () => {
    const hits = searchEntries(
      [entry({ merchant: "ארומה" })],
      "Netflix",
    );
    expect(hits).toEqual([]);
  });
});
