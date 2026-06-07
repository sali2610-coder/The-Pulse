// Phase 420 — installment edit must propagate to Credit Cards view.
//
// Regression: when a multi-installment entry is edited in Settings
// (chargeDate / installments / amount / accountId), the credit-card
// breakdown reads the current rule/entry data via sliceForMonth and
// installmentMetaForRefId. Both helpers MUST recompute from live
// store data — no cached slice index, no stale derived state.

import { describe, expect, it } from "vitest";

import {
  installmentMetaForRefId,
  installmentMetaForSource,
} from "@/lib/installment-meta";
import { getCreditCardStatement } from "@/lib/credit-card-statement";
import type { Account, ExpenseEntry } from "@/types/finance";

const MONTH_KEY = "2026-06" as const;

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-1",
    kind: "card",
    label: o.label ?? "Visa Premium",
    cardLast4: o.cardLast4 ?? "7093",
    issuer: o.issuer ?? "cal",
    billingDay: o.billingDay ?? 2,
    paymentDay: o.paymentDay ?? 10,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function installmentEntry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  // Default: 600 ILS purchase split across 6 monthly installments,
  // starting March 2026. June 2026 is therefore slice index 3
  // (= installment 4 of 6).
  const iso = o.chargeDate ?? new Date(2026, 2, 15, 12, 0, 0).toISOString();
  return {
    id: o.id ?? "e-installment",
    amount: 600,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    accountId: "card-1",
    installments: 6,
    chargeDate: iso,
    createdAt: iso,
    occurredAt: iso,
    ...o,
  };
}

describe("installmentMetaForRefId — entry installments live-read from store", () => {
  it("returns 4/6 when chargeDate is 3 months before monthKey", () => {
    const entry = installmentEntry();
    const meta = installmentMetaForRefId({
      refId: `entry:${entry.id}`,
      monthKey: MONTH_KEY,
      entries: [entry],
      rules: [],
    });
    expect(meta).not.toBeNull();
    expect(meta!.current).toBe(4);
    expect(meta!.total).toBe(6);
    expect(meta!.remaining).toBe(2);
  });

  it("returns 5/6 immediately after chargeDate is moved one month earlier", () => {
    const before = installmentEntry();
    const metaBefore = installmentMetaForRefId({
      refId: `entry:${before.id}`,
      monthKey: MONTH_KEY,
      entries: [before],
      rules: [],
    });
    expect(metaBefore!.current).toBe(4);

    // User edits chargeDate from 2026-03-15 to 2026-02-15.
    const after: ExpenseEntry = {
      ...before,
      chargeDate: new Date(2026, 1, 15, 12, 0, 0).toISOString(),
    };
    const metaAfter = installmentMetaForRefId({
      refId: `entry:${after.id}`,
      monthKey: MONTH_KEY,
      entries: [after],
      rules: [],
    });
    expect(metaAfter!.current).toBe(5);
    expect(metaAfter!.total).toBe(6);
    expect(metaAfter!.remaining).toBe(1);
  });

  it("returns null when chargeDate moves to a future month (slice not active yet)", () => {
    const future = installmentEntry({
      chargeDate: new Date(2026, 6, 15, 12, 0, 0).toISOString(),
    });
    const meta = installmentMetaForRefId({
      refId: `entry:${future.id}`,
      monthKey: MONTH_KEY,
      entries: [future],
      rules: [],
    });
    expect(meta).toBeNull();
  });

  it("returns null when installments edited down past the slice index", () => {
    const trimmed = installmentEntry({ installments: 3 });
    const meta = installmentMetaForRefId({
      refId: `entry:${trimmed.id}`,
      monthKey: MONTH_KEY,
      entries: [trimmed],
      rules: [],
    });
    expect(meta).toBeNull();
  });

  it("matches installmentMetaForSource so both call-sites stay in sync", () => {
    const entry = installmentEntry();
    const byRef = installmentMetaForRefId({
      refId: `entry:${entry.id}`,
      monthKey: MONTH_KEY,
      entries: [entry],
      rules: [],
    });
    const bySource = installmentMetaForSource({
      source: "entry",
      id: entry.id,
      monthKey: MONTH_KEY,
      entries: [entry],
      rules: [],
    });
    expect(byRef).toEqual(bySource);
  });
});

describe("Credit Cards statement reflects installment chargeDate edits", () => {
  it("entry appears under new card after accountId is edited", () => {
    const cards = [card({ id: "card-1" }), card({ id: "card-2", label: "Mastercard" })];
    const entry = installmentEntry({ accountId: "card-1" });
    const before = getCreditCardStatement({
      accounts: cards,
      rules: [],
      entries: [entry],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(before.cards.find((c) => c.cardId === "card-1")?.transactions.length).toBe(1);

    const edited: ExpenseEntry = { ...entry, accountId: "card-2" };
    const after = getCreditCardStatement({
      accounts: cards,
      rules: [],
      entries: [edited],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(after.cards.find((c) => c.cardId === "card-1")).toBeUndefined();
    expect(
      after.cards.find((c) => c.cardId === "card-2")?.transactions.length,
    ).toBe(1);
  });

  it("amount and slice update after entry.amount is edited", () => {
    const cards = [card({ id: "card-1" })];
    const entry = installmentEntry({ amount: 600, installments: 6 });
    const before = getCreditCardStatement({
      accounts: cards,
      rules: [],
      entries: [entry],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(before.cards[0]!.transactions[0]!.amount).toBe(100);

    const edited: ExpenseEntry = { ...entry, amount: 1200 };
    const after = getCreditCardStatement({
      accounts: cards,
      rules: [],
      entries: [edited],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(after.cards[0]!.transactions[0]!.amount).toBe(200);
  });
});
