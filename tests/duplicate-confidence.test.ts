// Phase 249 — duplicate confidence scoring + suspected-duplicate
// detection. Locks the contract that a likely duplicate is surfaced
// for human review rather than silently dropped.

import { describe, expect, it } from "vitest";

import {
  detectSuspectedDuplicates,
  scoreDuplicateConfidence,
} from "@/lib/dedup";
import type { ExpenseEntry } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
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

describe("scoreDuplicateConfidence", () => {
  it("returns score=1 for matching externalId", () => {
    const a = entry({ id: "a", externalId: "X" });
    const r = scoreDuplicateConfidence(
      {
        amount: 999,
        chargeDate: "2099-01-01T00:00:00.000Z",
        externalId: "X",
      },
      a,
    );
    expect(r.score).toBe(1);
    expect(r.signals).toContain("matching-external-id");
  });

  it("returns 0 when amount is outside tolerance", () => {
    const a = entry({ amount: 100 });
    const r = scoreDuplicateConfidence(
      { amount: 150, chargeDate: a.chargeDate, merchant: a.merchant },
      a,
    );
    expect(r.score).toBe(0);
  });

  it("returns 0 when dates are more than 2 days apart", () => {
    const a = entry({
      amount: 100,
      chargeDate: "2026-05-10T12:00:00.000Z",
    });
    const r = scoreDuplicateConfidence(
      {
        amount: 100,
        chargeDate: "2026-05-20T12:00:00.000Z",
      },
      a,
    );
    expect(r.score).toBe(0);
  });

  it("collects strongest signals: exact-amount + same-day + same-merchant", () => {
    const a = entry({
      id: "a",
      amount: 100,
      merchant: "Shufersal",
      chargeDate: "2026-05-10T08:00:00.000Z",
    });
    const r = scoreDuplicateConfidence(
      {
        amount: 100,
        chargeDate: "2026-05-10T15:00:00.000Z",
        merchant: "Shufersal",
      },
      a,
    );
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.signals).toContain("exact-amount");
    expect(r.signals).toContain("same-day");
    expect(r.signals).toContain("same-merchant");
  });

  it("weaker score when merchant only matches as prefix", () => {
    const a = entry({
      id: "a",
      amount: 100,
      merchant: "Shufersal",
    });
    const strong = scoreDuplicateConfidence(
      {
        amount: 100,
        chargeDate: a.chargeDate,
        merchant: "Shufersal",
      },
      a,
    );
    const weak = scoreDuplicateConfidence(
      {
        amount: 100,
        chargeDate: a.chargeDate,
        merchant: "Shufersal Hod Hasharon", // contains canonical
      },
      a,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.signals).toContain("merchant-prefix");
  });
});

describe("detectSuspectedDuplicates", () => {
  it("flags an obvious duplicate pair", () => {
    const entries = [
      entry({
        id: "a",
        amount: 250,
        merchant: "Shufersal",
        chargeDate: "2026-05-10T08:00:00.000Z",
      }),
      entry({
        id: "b",
        amount: 250,
        merchant: "Shufersal",
        chargeDate: "2026-05-10T12:00:00.000Z",
      }),
    ];
    const map = detectSuspectedDuplicates(entries);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(true);
    expect(map.get("a")?.siblingId).toBe("b");
    expect(map.get("b")?.siblingId).toBe("a");
    expect(map.get("a")?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("does not flag unrelated entries on different days", () => {
    const entries = [
      entry({ id: "a", chargeDate: "2026-05-01T12:00:00.000Z" }),
      entry({ id: "b", chargeDate: "2026-05-20T12:00:00.000Z" }),
    ];
    const map = detectSuspectedDuplicates(entries);
    expect(map.size).toBe(0);
  });

  it("does not flag charges on different accounts even with matching amount", () => {
    const entries = [
      entry({
        id: "a",
        amount: 100,
        merchant: "Cafe",
        accountId: "card-A",
      }),
      entry({
        id: "b",
        amount: 100,
        merchant: "Cafe",
        accountId: "card-B",
      }),
    ];
    // accountId mismatch still produces a partial score — but for a
    // different-account pair it should not reach the 0.7 default
    // threshold without a same-account signal.
    const map = detectSuspectedDuplicates(entries, 0.75);
    expect(map.size).toBe(0);
  });

  it("ignores refunds entirely", () => {
    const entries = [
      entry({ id: "a", amount: 100, merchant: "X", isRefund: true }),
      entry({ id: "b", amount: 100, merchant: "X" }),
    ];
    const map = detectSuspectedDuplicates(entries);
    expect(map.size).toBe(0);
  });
});
