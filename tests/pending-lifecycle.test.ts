import { describe, expect, it } from "vitest";

import { classifyPending } from "@/lib/pending-lifecycle";
import type { ExpenseEntry } from "@/types/finance";

function entry(opts: Partial<ExpenseEntry> & { amount: number; iso: string }): ExpenseEntry {
  const { amount, iso, ...rest } = opts;
  return {
    id: opts.id ?? `e-${iso}-${amount}-${Math.random().toString(36).slice(2, 6)}`,
    amount,
    installments: 1,
    chargeDate: iso,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    createdAt: iso,
    ...rest,
  };
}

describe("classifyPending", () => {
  it("empty report on empty entries", () => {
    const r = classifyPending({ entries: [] });
    expect(r.classifications).toEqual([]);
    expect(r.counts.awaitingReview).toBe(0);
  });

  it("classifies awaiting_review / bank_pending / both", () => {
    const r = classifyPending({
      entries: [
        entry({
          id: "a",
          amount: 50,
          iso: "2026-05-15T10:00:00Z",
          needsConfirmation: true,
        }),
        entry({
          id: "b",
          amount: 50,
          iso: "2026-05-15T10:00:00Z",
          bankPending: true,
        }),
        entry({
          id: "c",
          amount: 50,
          iso: "2026-05-15T10:00:00Z",
          needsConfirmation: true,
          bankPending: true,
        }),
      ],
    });
    expect(r.counts).toEqual({
      awaitingReview: 1,
      bankPending: 1,
      both: 1,
      mergeCandidates: 0,
    });
  });

  it("flags merge candidates against confirmed siblings", () => {
    const confirmed = entry({
      id: "confirmed",
      amount: 42,
      iso: "2026-05-15T09:00:00Z",
      merchant: "ארומה",
      confirmedAt: "2026-05-15T09:01:00Z",
    });
    const pending = entry({
      id: "pending",
      amount: 42,
      iso: "2026-05-15T10:00:00Z",
      merchant: "ארומה סניף 3",
      needsConfirmation: true,
    });
    const r = classifyPending({ entries: [confirmed, pending] });
    const p = r.classifications.find((c) => c.entry.id === "pending");
    expect(p?.mergeCandidate).toBe(true);
    expect(r.counts.mergeCandidates).toBe(1);
  });

  it("does NOT merge across different merchants", () => {
    const confirmed = entry({
      id: "confirmed",
      amount: 42,
      iso: "2026-05-15T09:00:00Z",
      merchant: "ארומה",
      confirmedAt: "2026-05-15T09:01:00Z",
    });
    const pending = entry({
      id: "pending",
      amount: 42,
      iso: "2026-05-15T10:00:00Z",
      merchant: "Wolt",
      needsConfirmation: true,
    });
    const r = classifyPending({ entries: [confirmed, pending] });
    const p = r.classifications.find((c) => c.entry.id === "pending");
    expect(p?.mergeCandidate).toBe(false);
  });
});
