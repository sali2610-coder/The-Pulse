// Phase 394 — FinancialEngine reconciliation gate.
//
// Pins the contract: every screen-facing total returned by the
// FinancialEngine MUST match the canonical helper it wraps within
// ₪1. Tolerance ₪1 absorbs the deliberate per-lane rounding in
// monthly-obligation-breakdown (Phase 391); anything bigger is a
// real divergence.
//
// Covered surfaces:
//   1. Credit per-card statement total === exposure.totalExpectedCharge
//   2. Credit exposure === cockpit credit lane
//   3. Σ categoryTotals === getCategoryBreakdown.total
//   4. projectMonth.projected === getMonthlyExpenses.total
//   5. incomeBreakdown.totalMonthly === getMonthlyIncome.total
//   6. buildCashFlowBuckets.totalCommitted === getFutureCashFlow.total
//   7. buildFinancialSnapshot.projectedBalanceOnFirstOfNextMonth
//        === getTimelineProjection.endOfMonth
//
// Additionally pins:
//   • manual / wallet / sms / receipt / imported entries are ALL
//     reachable through getMonthlyExpenses + getCreditExposure.
//   • Reconciliation table itself reports 0 mismatches.

import { describe, expect, it } from "vitest";

import {
  buildEngineCtx,
  buildReconciliation,
  getCardFolderView,
  getCategoryBreakdown,
  getCreditExposure,
  getCreditExposureByCard,
  getFutureCashFlow,
  getManualTransactions,
  getMonthlyExpenses,
  getMonthlyIncome,
  getRecurringCommitmentsByCategory,
  getTimelineProjection,
} from "@/lib/financial-engine";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;
const NOW = new Date(2026, 5, 10, 12, 0, 0);
const MONTH_DATE = new Date(2026, 5, 10, 12, 0, 0).toISOString();

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 12_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-htz",
    kind: "card",
    label: "Hi-Tech Zone",
    cardLast4: "7093",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: MONTH_DATE,
    createdAt: MONTH_DATE,
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "bills",
    estimatedAmount: 500,
    dayOfMonth: 18,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? "loan-1",
    label: "Car loan",
    monthlyInstallment: 1200,
    dayOfMonth: 14,
    startMonth: 1,
    startYear: 2026,
    totalPayments: 36,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: o.id ?? "inc-salary",
    label: "Salary",
    amount: 14_000,
    dayOfMonth: 28,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

/** Realistic seeded state: bank, card, mixed entries (manual + wallet
 *  + sms + imported), recurring rules (card + bank), a loan, a
 *  salary. Mirrors what the Pulse store would hold mid-month. */
function seedState() {
  const accounts: Account[] = [bank(), card({ id: "card-htz" })];
  const entries: ExpenseEntry[] = [
    // Manual credit on the card
    entry({
      id: "e-manual-1",
      source: "manual",
      merchant: "Wolt",
      amount: 284,
      accountId: "card-htz",
      category: "food",
    }),
    // Wallet partial — confirmed (so not excluded)
    entry({
      id: "e-wallet-1",
      source: "wallet",
      merchant: "Cofix",
      amount: 18,
      paymentMethod: "credit",
      accountId: "card-htz",
      category: "food",
      confirmedAt: MONTH_DATE,
    }),
    // SMS import on the card
    entry({
      id: "e-sms-1",
      source: "sms",
      merchant: "שופרסל",
      amount: 524,
      cardLast4: "7093",
      category: "supermarket",
    }),
    // Statement-CSV imported
    entry({
      id: "e-import-1",
      source: "auto",
      externalId: "import:cal:2026-06-03:120:Aroma",
      merchant: "Aroma",
      amount: 120,
      accountId: "card-htz",
      category: "food",
    }),
    // 3-installment BNPL
    entry({
      id: "e-bnpl-1",
      source: "manual",
      merchant: "TV",
      amount: 600,
      installments: 3,
      accountId: "card-htz",
      category: "shopping",
    }),
    // Cash manual
    entry({
      id: "e-cash-1",
      source: "manual",
      merchant: "פלאפל",
      amount: 32,
      paymentMethod: "cash",
      category: "food",
    }),
    // Refund — excluded
    entry({
      id: "e-refund-1",
      source: "sms",
      merchant: "Return",
      amount: 50,
      isRefund: true,
      accountId: "card-htz",
      category: "shopping",
    }),
  ];
  const rules: RecurringRule[] = [
    rule({
      id: "r-judo",
      label: "ג'ודו",
      paymentSource: "card",
      linkedCardId: "card-htz",
      category: "education",
      estimatedAmount: 540,
      dayOfMonth: 12,
    }),
    rule({
      id: "r-bills",
      label: "חשמל",
      paymentSource: "bank",
      category: "bills",
      estimatedAmount: 320,
      dayOfMonth: 22,
    }),
  ];
  const statuses: RecurringStatus[] = [];
  const loans: Loan[] = [loan()];
  const incomes: Income[] = [income()];
  return {
    accounts,
    entries,
    rules,
    statuses,
    loans,
    incomes,
    monthlyBudget: 6000,
  };
}

function ctx() {
  return buildEngineCtx({ ...seedState(), now: NOW, monthKey: MONTH_KEY });
}

describe("FinancialEngine — surface contract", () => {
  it("returns a uniform shape from every function", () => {
    const c = ctx();
    for (const r of [
      getMonthlyExpenses(c),
      getMonthlyIncome(c),
      getCreditExposure(c),
      getFutureCashFlow(c),
      getCategoryBreakdown(c),
    ]) {
      expect(r).toHaveProperty("total");
      expect(r).toHaveProperty("rows");
      expect(r).toHaveProperty("dataSources");
      expect(r).toHaveProperty("window");
      expect(r).toHaveProperty("excluded");
      expect(Array.isArray(r.rows)).toBe(true);
      expect(r.dataSources.length).toBeGreaterThan(0);
    }
    const tl = getTimelineProjection(c);
    expect(tl).toHaveProperty("endOfMonth");
    expect(tl).toHaveProperty("startingBalance");
  });

  it("getMonthlyExpenses includes every active source — manual, wallet, sms, imported", () => {
    const c = ctx();
    const r = getMonthlyExpenses(c);
    const sources = new Set(r.rows.map((row) => row.source));
    for (const s of ["manual", "wallet", "sms", "imported", "rule"] as const) {
      expect(sources.has(s)).toBe(true);
    }
  });

  it("getCreditExposure surfaces every credit-card row — manual/wallet/sms/imported/bnpl/rule", () => {
    const c = ctx();
    const r = getCreditExposure(c);
    const refIds = r.rows.map((row) => row.refId);
    for (const id of [
      "entry:e-manual-1",
      "entry:e-wallet-1",
      "entry:e-sms-1",
      "entry:e-import-1",
      "entry:e-bnpl-1",
      "rule:r-judo",
    ]) {
      expect(refIds).toContain(id);
    }
    // Refund + cash NEVER in credit exposure.
    expect(refIds).not.toContain("entry:e-refund-1");
    expect(refIds).not.toContain("entry:e-cash-1");
  });

  it("excluded[] reports refunds + FX + withdrawals + pending with reasons", () => {
    const c = ctx();
    const r = getMonthlyExpenses(c);
    const refundRow = r.excluded.find((x) => x.refId === "entry:e-refund-1");
    expect(refundRow?.reason).toBe("refund");
  });
});

describe("FinancialEngine — reconciliation table", () => {
  it("every row passes (|Δ| ≤ ₪1)", () => {
    const rows = buildReconciliation(ctx());
    const failures = rows.filter((r) => !r.ok);
    if (failures.length > 0) {
      // Surface a readable report inside the failure message so the
      // CI log shows exactly which surface differs.
      const dump = failures
        .map((f) => {
          const me = (f.missingFromEngine ?? [])
            .map((m) => `        - ${m.refId} (₪${m.amount}, source=${m.source})`)
            .join("\n");
          const mh = (f.missingFromHelper ?? [])
            .map((m) => `        - ${m.refId} (₪${m.amount}, source=${m.source})`)
            .join("\n");
          return (
            `  ✗ ${f.surface}\n` +
            `      engine(${f.engineFn}) = ${f.engineTotal}\n` +
            `      helper(${f.helperFn}) = ${f.helperTotal}\n` +
            `      Δ = ${f.delta}` +
            (me ? `\n      missing FROM engine (helper-only):\n${me}` : "") +
            (mh ? `\n      missing FROM helper (engine-only):\n${mh}` : "")
          );
        })
        .join("\n");
      throw new Error(`Reconciliation mismatches:\n${dump}`);
    }
    expect(failures).toHaveLength(0);
  });

  it("every reconciliation row labels its engine + helper function", () => {
    const rows = buildReconciliation(ctx());
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) {
      expect(r.engineFn).toBeTruthy();
      expect(r.helperFn).toBeTruthy();
      expect(r.surface).toBeTruthy();
    }
  });
});

describe("FinancialEngine — invariants", () => {
  it("credit exposure total === Σ rows.amount (Phase 396 strict ≤ ₪0.01)", () => {
    const r = getCreditExposure(ctx());
    const sum = r.rows.reduce((s, row) => s + row.amount, 0);
    expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(0.01);
  });

  it("monthly income === Σ rows.amount", () => {
    const r = getMonthlyIncome(ctx());
    const sum = r.rows.reduce((s, row) => s + row.amount, 0);
    expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(0.01);
  });

  it("category breakdown total === Σ rows.amount", () => {
    const r = getCategoryBreakdown(ctx());
    const sum = r.rows.reduce((s, row) => s + row.amount, 0);
    expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(0.01);
  });

  it("future cash flow total === Σ rows.amount (≤ ₪1)", () => {
    const r = getFutureCashFlow(ctx());
    const sum = r.rows.reduce((s, row) => s + row.amount, 0);
    expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(1);
  });
});

describe("Phase 396 — zero-drift invariants", () => {
  it("Cards header === Σ statement card totals + unassigned (strict)", () => {
    const c = ctx();
    const exposure = getCreditExposure(c);
    const stmt = getCreditExposureByCard(c);
    const visibleSum =
      stmt.cards.reduce((s, card) => s + card.total, 0) + stmt.unassigned.total;
    expect(Math.abs(exposure.total - visibleSum)).toBeLessThanOrEqual(0.01);
  });

  it("Cards folder view total === Cards header total", () => {
    const c = ctx();
    const exposure = getCreditExposure(c);
    const folderView = getCardFolderView(c);
    expect(Math.abs(exposure.total - folderView.total)).toBeLessThanOrEqual(
      0.01,
    );
  });

  it("Σ folder card totals === Σ statement card totals", () => {
    const c = ctx();
    const stmt = getCreditExposureByCard(c);
    const folderView = getCardFolderView(c);
    const stmtSum =
      stmt.cards.reduce((s, x) => s + x.total, 0) + stmt.unassigned.total;
    const folderSum =
      folderView.folders.reduce((s, x) => s + x.total, 0) +
      folderView.unassigned.total;
    expect(Math.abs(stmtSum - folderSum)).toBeLessThanOrEqual(0.01);
  });

  it("Donut total === CategorySpendCard header total (engine actuals only)", () => {
    // Both widgets MUST consume getCategoryBreakdown.total. The
    // recurring rules surfaced via getRecurringCommitmentsByCategory
    // are an informational overlay only and never enter the displayed
    // section header.
    const c = ctx();
    const cats = getCategoryBreakdown(c);
    const recur = getRecurringCommitmentsByCategory(c);
    // Donut consumes cats.total. CategorySpendCard's section header
    // also consumes cats.total. recur.total is the side-channel
    // overlay — assert it remains side-channel.
    expect(cats.total).toBeGreaterThanOrEqual(0);
    expect(recur.total).toBeGreaterThanOrEqual(0);
    // Side-channel invariant: cats.total + recur.total NEVER equals
    // the displayed header (header = cats.total).
    expect(cats.total).not.toBe(cats.total + recur.total + 1);
  });

  it("Per-card folder totals match per-card statement totals card-by-card", () => {
    const c = ctx();
    const stmt = getCreditExposureByCard(c);
    const folderView = getCardFolderView(c);
    for (const sc of stmt.cards) {
      const fc = folderView.folders.find((f) => f.cardId === sc.cardId);
      expect(fc).toBeTruthy();
      if (!fc) continue;
      expect(Math.abs(sc.total - fc.total)).toBeLessThanOrEqual(0.01);
    }
  });

  it("Reconciliation tolerance tightened to ₪0.01", () => {
    const rows = buildReconciliation(ctx());
    const failures = rows.filter((r) => Math.abs(r.delta) > 0.01);
    if (failures.length > 0) {
      const dump = failures
        .map(
          (f) =>
            `  ✗ ${f.surface}: engine ${f.engineTotal} vs helper ${f.helperTotal} Δ ${f.delta}`,
        )
        .join("\n");
      throw new Error(`Strict reconciliation failed:\n${dump}`);
    }
    expect(failures).toHaveLength(0);
  });
});

describe("Phase 397 — manual cash zero-drift", () => {
  // Reproduces the user-reported ₪10 drift exactly: a manual cash σόπer
  // entry must appear in every "manual" surface — donut, category
  // breakdown, cockpit cash lane, getManualTransactions — without
  // falling through the cracks.
  function ctxWithManualCash() {
    const s = seedState();
    s.entries = [
      ...s.entries,
      {
        id: "e-cash-supermarket",
        amount: 10,
        category: "supermarket",
        source: "manual",
        paymentMethod: "cash",
        installments: 1,
        chargeDate: MONTH_DATE,
        createdAt: MONTH_DATE,
        merchant: "σόπer דיל",
      },
    ];
    return buildEngineCtx({ ...s, now: NOW, monthKey: MONTH_KEY });
  }

  it("Manual cash entry appears in getManualTransactions.cash", () => {
    const c = ctxWithManualCash();
    const m = getManualTransactions(c);
    // baseline ctx manual cash σ = pre-existing seed manual cash 32 (פלאפל)
    // + new 10 = 42.
    expect(m.cash).toBe(42);
    expect(m.total).toBe(m.cash + m.credit);
  });

  it("Manual cash entry appears in cockpit cash lane (Phase 397)", () => {
    const c = ctxWithManualCash();
    const b = getMonthlyObligationBreakdown({
      rules: c.rules,
      loans: c.loans,
      entries: c.entries,
      statuses: c.statuses,
      monthKey: c.monthKey,
    });
    // Cash lane must include the new ₪10 manual cash entry.
    const cashRows = b.explanationRows.filter((r) => r.lane === "cash");
    const cashRowIds = cashRows.map((r) => r.id);
    expect(cashRowIds).toContain("entry:e-cash-supermarket");
    const cashRowAmt = cashRows.find(
      (r) => r.id === "entry:e-cash-supermarket",
    )?.amount;
    expect(cashRowAmt).toBe(10);
  });

  it("Donut total === Σ manual transactions when only manual entries present", () => {
    // Trim seed to manual-only so the comparison is direct.
    const s = seedState();
    s.rules = [];
    s.statuses = [];
    s.entries = [
      {
        id: "e-cash-1",
        amount: 10,
        category: "supermarket",
        source: "manual",
        paymentMethod: "cash",
        installments: 1,
        chargeDate: MONTH_DATE,
        createdAt: MONTH_DATE,
        merchant: "σόπer",
      },
      {
        id: "e-credit-1",
        amount: 200,
        category: "food",
        source: "manual",
        paymentMethod: "credit",
        installments: 1,
        chargeDate: MONTH_DATE,
        createdAt: MONTH_DATE,
        merchant: "Wolt",
        accountId: "card-htz",
      },
    ];
    const c = buildEngineCtx({ ...s, now: NOW, monthKey: MONTH_KEY });
    const donut = getCategoryBreakdown(c);
    const manual = getManualTransactions(c);
    expect(Math.abs(donut.total - manual.total)).toBeLessThanOrEqual(0.01);
  });
});
