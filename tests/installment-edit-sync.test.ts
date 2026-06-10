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
import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import { buildCardMonthFolders } from "@/lib/card-month-folders";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

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

describe("Rule installments — paymentNumber recomputes from live rule fields", () => {
  function installmentRule(o: Partial<RecurringRule> = {}): RecurringRule {
    return {
      id: o.id ?? "r-installment",
      label: "iPhone — 6 תשלומים",
      category: "shopping",
      estimatedAmount: 250,
      dayOfMonth: 10,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      installmentTotal: 6,
      startMonth: 3,
      startYear: 2026,
      paymentSource: "card",
      linkedCardId: "card-1",
      ...o,
    };
  }

  it("returns 4/6 for June when startMonth=March", () => {
    const rule = installmentRule();
    const meta = installmentMetaForRefId({
      refId: `rule:${rule.id}`,
      monthKey: MONTH_KEY,
      entries: [],
      rules: [rule],
    });
    expect(meta).not.toBeNull();
    expect(meta!.current).toBe(4);
    expect(meta!.total).toBe(6);
  });

  it("returns 5/6 immediately after startMonth is shifted one month earlier", () => {
    const before = installmentRule();
    const metaBefore = installmentMetaForRefId({
      refId: `rule:${before.id}`,
      monthKey: MONTH_KEY,
      entries: [],
      rules: [before],
    });
    expect(metaBefore!.current).toBe(4);

    const after: RecurringRule = { ...before, startMonth: 2, startYear: 2026 };
    const metaAfter = installmentMetaForRefId({
      refId: `rule:${after.id}`,
      monthKey: MONTH_KEY,
      entries: [],
      rules: [after],
    });
    expect(metaAfter!.current).toBe(5);
  });
});

describe("Full card-breakdown pipeline reflects installment edits end-to-end", () => {
  it("entry installment 4/6 → 5/6 propagates through buildCardCategoryBreakdown and buildCardMonthFolders", () => {
    const cards: Account[] = [card({ id: "card-1" })];
    const entry: ExpenseEntry = installmentEntry({
      amount: 600,
      installments: 6,
    });
    const now = new Date(2026, 5, 15, 12, 0, 0);

    const reportBefore = buildCardCategoryBreakdown({
      accounts: cards,
      loans: [],
      rules: [],
      statuses: [],
      entries: [entry],
      now,
    });
    const foldersBefore = buildCardMonthFolders(reportBefore, now);
    const itemBefore = foldersBefore[0]?.categories[0]?.items[0];
    expect(itemBefore).toBeDefined();
    // Phase 421 — meta MUST be resolved against the purchase month,
    // not the folder's cash-settle month, or every installment row
    // displays an off-by-one index in cards-hierarchy.
    const metaBefore = installmentMetaForRefId({
      refId: itemBefore!.refId,
      monthKey: itemBefore!.purchaseMonthKey,
      entries: [entry],
      rules: [],
    });
    expect(metaBefore!.current).toBe(4);
    expect(itemBefore!.amount).toBe(100);

    // User edits chargeDate one month earlier in Settings.
    const edited: ExpenseEntry = {
      ...entry,
      chargeDate: new Date(2026, 1, 15, 12, 0, 0).toISOString(),
    };
    const reportAfter = buildCardCategoryBreakdown({
      accounts: cards,
      loans: [],
      rules: [],
      statuses: [],
      entries: [edited],
      now,
    });
    const foldersAfter = buildCardMonthFolders(reportAfter, now);
    const itemAfter = foldersAfter[0]?.categories[0]?.items[0];
    expect(itemAfter).toBeDefined();
    const metaAfter = installmentMetaForRefId({
      refId: itemAfter!.refId,
      monthKey: itemAfter!.purchaseMonthKey,
      entries: [edited],
      rules: [],
    });
    expect(metaAfter!.current).toBe(5);
    expect(itemAfter!.amount).toBe(100);
  });

  it("rule installment 4/6 → 5/6 propagates through buildCardCategoryBreakdown", () => {
    const cards: Account[] = [card({ id: "card-1" })];
    const rule: RecurringRule = {
      id: "r-rule-install",
      label: "iPad — 6 תשלומים",
      category: "shopping",
      estimatedAmount: 300,
      dayOfMonth: 10,
      keywords: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      installmentTotal: 6,
      startMonth: 3,
      startYear: 2026,
      paymentSource: "card",
      linkedCardId: "card-1",
    };
    const now = new Date(2026, 5, 15, 12, 0, 0);

    const reportBefore = buildCardCategoryBreakdown({
      accounts: cards,
      loans: [],
      rules: [rule],
      statuses: [],
      entries: [],
      now,
    });
    const foldersBefore = buildCardMonthFolders(reportBefore, now);
    const itemBefore = foldersBefore[0]?.categories[0]?.items[0];
    expect(itemBefore).toBeDefined();
    const metaBefore = installmentMetaForRefId({
      refId: itemBefore!.refId,
      monthKey: itemBefore!.purchaseMonthKey,
      entries: [],
      rules: [rule],
    });
    expect(metaBefore!.current).toBe(4);

    const edited: RecurringRule = { ...rule, startMonth: 2, startYear: 2026 };
    const reportAfter = buildCardCategoryBreakdown({
      accounts: cards,
      loans: [],
      rules: [edited],
      statuses: [],
      entries: [],
      now,
    });
    const foldersAfter = buildCardMonthFolders(reportAfter, now);
    const itemAfter = foldersAfter[0]?.categories[0]?.items[0];
    expect(itemAfter).toBeDefined();
    const metaAfter = installmentMetaForRefId({
      refId: itemAfter!.refId,
      monthKey: itemAfter!.purchaseMonthKey,
      entries: [],
      rules: [edited],
    });
    expect(metaAfter!.current).toBe(5);
  });
});
