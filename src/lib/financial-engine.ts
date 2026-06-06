// Phase 394 — FinancialEngine facade.
//
// SINGLE financial contract every screen consumes. Every helper
// remains. This module is a thin, uniform wrapper that:
//
//   1. Hides direct-helper calls behind one surface.
//   2. Returns a uniform `EngineResult` so reconciliation tests can
//      diff totals & rows across surfaces.
//   3. Documents the exact data sources + window each function uses.
//
// No new math is introduced here. Every total this engine returns is
// computed by an existing canonical helper. Mismatches between
// surfaces become testable: any |Δ| ≥ ₪1 fails CI.
//
// Hard rules (enforced by tests/reconciliation.test.ts):
//   • getCreditExposure().total === getCreditCardExposure.totalExpectedCharge
//   • getCreditExposure().total === getCreditCardStatement.total
//   • getCreditExposure().total === getMonthlyObligationBreakdown.creditCardsTotal
//   • getTimelineProjection().endOfMonth ===
//       buildFinancialSnapshot.projectedBalanceOnFirstOfNextMonth
//   • getMonthlyExpenses() includes every manual/wallet/sms/imported/
//     receipt entry touching the month (no source-side drops).
//   • getCategoryBreakdown().total === Σ categoryTotals(month)
//
// Consumers MUST NOT import the underlying helpers directly. ESLint
// guard (next PR) will enforce.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";

import {
  projectMonth,
  categoryTotals,
  sliceForMonth,
  pendingRulesForMonth,
} from "@/lib/projections";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import {
  getCreditCardStatement,
  type CreditCardStatement,
} from "@/lib/credit-card-statement";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import { incomeBreakdown } from "@/lib/income-breakdown";
import { monthKeyOf } from "@/lib/dates";

// ── Public contract ────────────────────────────────────────────────

export type EngineCtx = {
  monthKey: MonthKey;
  now: Date;
  accounts: Account[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
};

export type EngineRowSource =
  | "manual"
  | "wallet"
  | "sms"
  | "auto"
  | "imported"
  | "rule"
  | "loan"
  | "income"
  | "refund";

export type EngineRow = {
  refId: string;
  label: string;
  amount: number;
  source: EngineRowSource;
  kind: "entry" | "rule" | "loan" | "income" | "bucket";
  category?: CategoryId;
  meta?: Record<string, unknown>;
};

export type EngineExclusion = {
  refId: string;
  reason: string;
  amount?: number;
};

export type EngineWindow = {
  from: string;
  to: string;
  monthKey: MonthKey;
};

export type EngineResult = {
  total: number;
  rows: EngineRow[];
  dataSources: string[];
  window: EngineWindow;
  excluded: EngineExclusion[];
};

export type TimelineResult = EngineResult & {
  startingBalance: number;
  endOfMonth: number;
  lowestPoint: { whenISO: string; balance: number };
  crossesNegative: boolean;
};

// ── Internal helpers ───────────────────────────────────────────────

function monthWindow(monthKey: MonthKey): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0).toISOString(),
    to: new Date(y, m, 0, 23, 59, 59).toISOString(),
  };
}

function entryEngineSource(e: ExpenseEntry): EngineRowSource {
  // Check `externalId` FIRST — statement-CSV imports often arrive with
  // `source: "auto"` but their externalId carries the "import:" prefix
  // (deterministic dedup key). Classifying them as "auto" would hide
  // the "imported" source from any per-source audit.
  if (e.externalId?.startsWith("import:")) return "imported";
  if (e.source === "wallet") return "wallet";
  if (e.source === "sms") return "sms";
  if (e.source === "auto") return "auto";
  return "manual";
}

// ── 1. getMonthlyExpenses ──────────────────────────────────────────
//
// All expense slices charged this month + pending recurring rules.
// Source: projectMonth + sliceForMonth + pendingRulesForMonth.
// Includes every manual / wallet / sms / imported / receipt entry
// whose slice touches `monthKey`. Excludes refunds, FX, withdrawals,
// excludeFromBudget, needsConfirmation, bankPending — same as
// projectMonth.

export function getMonthlyExpenses(ctx: EngineCtx): EngineResult {
  const { from, to } = monthWindow(ctx.monthKey);
  const rows: EngineRow[] = [];
  const excluded: EngineExclusion[] = [];

  for (const e of ctx.entries) {
    const slice = sliceForMonth(e, ctx.monthKey);
    if (!slice) continue;
    if (e.needsConfirmation && !e.confirmedAt) {
      excluded.push({ refId: `entry:${e.id}`, reason: "needsConfirmation", amount: slice.amount });
      continue;
    }
    if (e.bankPending) {
      excluded.push({ refId: `entry:${e.id}`, reason: "bankPending", amount: slice.amount });
      continue;
    }
    if (e.isRefund) {
      excluded.push({ refId: `entry:${e.id}`, reason: "refund", amount: slice.amount });
      continue;
    }
    if (e.excludeFromBudget) {
      excluded.push({ refId: `entry:${e.id}`, reason: "excludeFromBudget", amount: slice.amount });
      continue;
    }
    if (e.currency && e.currency !== "ILS") {
      excluded.push({ refId: `entry:${e.id}`, reason: `fx:${e.currency}`, amount: slice.amount });
      continue;
    }
    if (e.transactionType === "withdrawal") {
      excluded.push({ refId: `entry:${e.id}`, reason: "withdrawal", amount: slice.amount });
      continue;
    }
    rows.push({
      refId: `entry:${e.id}`,
      label: e.merchant ?? e.note ?? e.category,
      amount: slice.amount,
      source: entryEngineSource(e),
      kind: "entry",
      category: e.category,
      meta: { chargeDate: slice.chargeDate.toISOString() },
    });
  }

  for (const pr of pendingRulesForMonth({
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  })) {
    rows.push({
      refId: `rule:${pr.rule.id}`,
      label: pr.rule.label,
      amount: pr.rule.estimatedAmount,
      source: "rule",
      kind: "rule",
      category: pr.rule.category,
      meta: { expectedDate: pr.expectedDate.toISOString() },
    });
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    total,
    rows,
    dataSources: ["projectMonth", "sliceForMonth", "pendingRulesForMonth"],
    window: { from, to, monthKey: ctx.monthKey },
    excluded,
  };
}

// ── 2. getMonthlyIncome ────────────────────────────────────────────
//
// incomeBreakdown.totalMonthly — active incomes for monthKey
// (honors per-month actual overrides) + refund credit folded in.

export function getMonthlyIncome(ctx: EngineCtx): EngineResult {
  const { from, to } = monthWindow(ctx.monthKey);
  const br = incomeBreakdown({
    incomes: ctx.incomes,
    entries: ctx.entries,
    monthKey: ctx.monthKey,
    now: ctx.now,
  });
  const rows: EngineRow[] = br.sources.map((s) => ({
    refId: s.isRefund ? `refund:${ctx.monthKey}` : `income:${s.id}`,
    label: s.label,
    amount: s.amount,
    source: s.isRefund ? "refund" : "income",
    kind: "income",
  }));
  return {
    total: br.totalMonthly,
    rows,
    dataSources: ["incomeBreakdown"],
    window: { from, to, monthKey: ctx.monthKey },
    excluded: [],
  };
}

// ── 3. getCreditExposure ───────────────────────────────────────────
//
// Per-card statement. Total === getCreditCardExposure.totalExpectedCharge.

export function getCreditExposure(ctx: EngineCtx): EngineResult {
  const { from, to } = monthWindow(ctx.monthKey);
  const stmt = getCreditCardStatement({
    accounts: ctx.accounts,
    rules: ctx.rules,
    entries: ctx.entries,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  });
  const rows: EngineRow[] = [];
  for (const card of stmt.cards) {
    for (const tx of card.transactions) {
      rows.push({
        refId: tx.id,
        label: tx.label,
        amount: tx.amount,
        source: tx.kind === "rule" ? "rule" : "manual",
        kind: tx.kind === "rule" ? "rule" : "entry",
        category: tx.category,
        meta: { cardId: card.cardId, bucket: tx.bucket },
      });
    }
  }
  for (const tx of stmt.unassigned.transactions) {
    rows.push({
      refId: tx.id,
      label: tx.label,
      amount: tx.amount,
      source: tx.kind === "rule" ? "rule" : "manual",
      kind: tx.kind === "rule" ? "rule" : "entry",
      category: tx.category,
      meta: { cardId: "__unassigned__", bucket: tx.bucket },
    });
  }
  return {
    total: stmt.total,
    rows,
    dataSources: ["getCreditCardStatement", "getCreditCardExposure"],
    window: { from, to, monthKey: ctx.monthKey },
    excluded: [],
  };
}

// ── 4. getFutureCashFlow ───────────────────────────────────────────
//
// 35-day cash-flow buckets — credit + loans + bank debits.
// Total === buildCashFlowBuckets.totalCommitted.

export function getFutureCashFlow(ctx: EngineCtx): EngineResult {
  const report = buildCashFlowBuckets({
    accounts: ctx.accounts,
    loans: ctx.loans,
    rules: ctx.rules,
    statuses: ctx.statuses,
    entries: ctx.entries,
    now: ctx.now,
    windowDays: 35,
  });
  const rows: EngineRow[] = [];
  for (const b of report.buckets) {
    for (const o of b.obligations) {
      rows.push({
        refId: o.refId,
        label: `${b.label} · ${o.label}`,
        amount: o.amount,
        source:
          o.kind === "loan"
            ? "loan"
            : o.kind === "card_entry"
              ? "manual"
              : "rule",
        kind: o.kind === "loan" ? "loan" : o.kind === "card_entry" ? "entry" : "rule",
        meta: {
          bucketId: b.id,
          bucketSource: b.source,
          effectiveCashAt: o.effectiveCashAt,
          transactionAt: o.transactionAt,
        },
      });
    }
  }
  return {
    total: report.totalCommitted,
    rows,
    dataSources: ["buildCashFlowBuckets"],
    window: {
      from: report.windowStart,
      to: report.windowEnd,
      monthKey: ctx.monthKey,
    },
    excluded: [],
  };
}

// ── 5. getCategoryBreakdown ────────────────────────────────────────
//
// Per-category actual spend this month (charged, not future).
// Source: categoryTotals + sliceForMonth for per-category count and
// biggest-slice metadata.
//
// Phase 394 — row.meta carries { count, biggest } so consumers
// (CategoryDonut etc.) don't have to walk raw entries again.

export function getCategoryBreakdown(ctx: EngineCtx): EngineResult {
  const { from, to } = monthWindow(ctx.monthKey);
  const map = categoryTotals({
    entries: ctx.entries,
    monthKey: ctx.monthKey,
    now: ctx.now,
  });
  // Per-category count + biggest — walk monthly expense rows once.
  type Extras = { count: number; biggest: number };
  const extras = new Map<CategoryId, Extras>();
  const monthly = getMonthlyExpenses(ctx);
  for (const r of monthly.rows) {
    if (r.kind !== "entry" || !r.category) continue;
    // Future slices (chargeDate > now) are NOT in categoryTotals —
    // skip them here too so the count matches the visible total.
    const chargeAt = r.meta?.chargeDate as string | undefined;
    if (chargeAt && new Date(chargeAt).getTime() > ctx.now.getTime()) continue;
    const cur = extras.get(r.category) ?? { count: 0, biggest: 0 };
    cur.count += 1;
    if (r.amount > cur.biggest) cur.biggest = r.amount;
    extras.set(r.category, cur);
  }
  const rows: EngineRow[] = Array.from(map.entries())
    .map(([category, amount]) => {
      const ext = extras.get(category) ?? { count: 0, biggest: 0 };
      return {
        refId: `category:${category}`,
        label: category,
        amount,
        source: "manual" as EngineRowSource,
        kind: "bucket" as const,
        category,
        meta: { count: ext.count, biggest: ext.biggest },
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    total,
    rows,
    dataSources: ["categoryTotals", "getMonthlyExpenses"],
    window: { from, to, monthKey: ctx.monthKey },
    excluded: [],
  };
}

// ── 7. getPendingConfirmations ─────────────────────────────────────
//
// Entries the user has yet to confirm (Wallet partials, etc.).
// Source: ctx.entries filtered by needsConfirmation && !confirmedAt.
// These are EXCLUDED from every monetary total — surfaced separately
// so the PendingTray UI can list them without bypassing the engine.

export function getPendingConfirmations(ctx: EngineCtx): EngineResult {
  const { from, to } = monthWindow(ctx.monthKey);
  const rows: EngineRow[] = [];
  for (const e of ctx.entries) {
    if (!e.needsConfirmation) continue;
    if (e.confirmedAt) continue;
    rows.push({
      refId: `entry:${e.id}`,
      label: e.merchant ?? e.note ?? e.category,
      amount: e.amount,
      source: entryEngineSource(e),
      kind: "entry",
      category: e.category,
      meta: {
        createdAt: e.createdAt,
        cardLast4: e.cardLast4,
      },
    });
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    total,
    rows,
    dataSources: ["entries(needsConfirmation)"],
    window: { from, to, monthKey: ctx.monthKey },
    excluded: [],
  };
}

// ── 6a. getSnapshot ────────────────────────────────────────────────
//
// Phase 394 — `buildFinancialSnapshot` exposed through the engine so
// consumers like SmartSummaryCard / buildSmartSummary that need the
// full snapshot shape don't reach past the facade. Same canonical
// helper getTimelineProjection wraps.

export function getSnapshot(ctx: EngineCtx) {
  return buildFinancialSnapshot({
    accounts: ctx.accounts,
    loans: ctx.loans,
    incomes: ctx.incomes,
    entries: ctx.entries,
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthlyBudget: ctx.monthlyBudget,
    now: ctx.now,
    monthKey: ctx.monthKey,
  });
}

// ── 6. getTimelineProjection ───────────────────────────────────────
//
// 35-day liquidity curve + EOM snapshot.
// endOfMonth === buildFinancialSnapshot.projectedBalanceOnFirstOfNextMonth.

export function getTimelineProjection(ctx: EngineCtx): TimelineResult {
  const curve = liquidityCurve({
    accounts: ctx.accounts,
    loans: ctx.loans,
    incomes: ctx.incomes,
    rules: ctx.rules,
    statuses: ctx.statuses,
    entries: ctx.entries,
    now: ctx.now,
    windowDays: 35,
  });
  const snapshot = buildFinancialSnapshot({
    accounts: ctx.accounts,
    loans: ctx.loans,
    incomes: ctx.incomes,
    entries: ctx.entries,
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthlyBudget: ctx.monthlyBudget,
    now: ctx.now,
    monthKey: ctx.monthKey,
  });
  const rows: EngineRow[] = curve.points.map((p) => ({
    refId: `tl:${p.dayIndex}`,
    label: p.whenISO.slice(0, 10),
    amount: p.balance,
    source: "manual",
    kind: "bucket",
    meta: {
      dayIndex: p.dayIndex,
      delta: p.delta,
      eventCount: p.events.length,
    },
  }));
  const last = curve.points[curve.points.length - 1];
  return {
    total: last.balance,
    rows,
    dataSources: ["liquidityCurve", "buildFinancialSnapshot"],
    window: {
      from: curve.points[0]?.whenISO ?? ctx.now.toISOString(),
      to: last.whenISO,
      monthKey: ctx.monthKey,
    },
    excluded: [],
    startingBalance: curve.startingBalance,
    endOfMonth: snapshot.projectedBalanceOnFirstOfNextMonth,
    lowestPoint: {
      whenISO: curve.lowestPoint.whenISO,
      balance: curve.lowestPoint.balance,
    },
    crossesNegative: curve.crossesNegative,
  };
}

// ── 8. getActivityFeed ─────────────────────────────────────────────
//
// One row per entry-derived movement this month. INCLUDES every kind
// that the activity log surfaces: expenses, refunds (זיכוי),
// withdrawals (משיכה), bank-pending (תלוי), wallet partials awaiting
// confirmation (ממתין לאישור), confirmed wallet entries, card +
// manual + sms + imported transactions.
//
// Engine is the sole authority on what enters the feed. RecentActivity
// becomes a pure renderer — no entries.filter, no per-row math.
//
// Each row carries display flags so the UI can render badges without
// reaching back into the raw store.

export type ActivityFeedDirection = "in" | "out";
export type ActivityFeedPaySource =
  | "income"
  | "credit"
  | "cash"
  | "bank"
  | "wallet";

export type ActivityFeedRow = {
  refId: string;
  entryId: string;
  direction: ActivityFeedDirection;
  amount: number;
  /** ISO of the transaction moment we render (occurredAt > chargeDate
   *  > createdAt, with synthetic slice fallback). */
  whenISO: string;
  /** True when whenISO carries a real HH:mm:ss (recorded charge /
   *  refund / wallet event). False for synthesized future-installment
   *  slices anchored to noon-of-day. */
  hasRealTime: boolean;
  title: string;
  category: CategoryId;
  source: "manual" | "auto" | "sms" | "wallet";
  installments: number;
  isRefund: boolean;
  bankPending: boolean;
  needsConfirmation: boolean;
  excludeFromBudget: boolean;
  isWithdrawal: boolean;
  cardLast4?: string;
  paySource: ActivityFeedPaySource;
};

export type ActivityFeed = {
  rows: ActivityFeedRow[];
  dataSources: string[];
  window: EngineWindow;
};

function paySourceFor(e: ExpenseEntry): ActivityFeedPaySource {
  if (e.source === "wallet") return "wallet";
  if (e.paymentMethod === "cash") return "cash";
  return "credit";
}

export function getActivityFeed(ctx: EngineCtx): ActivityFeed {
  const { from, to } = monthWindow(ctx.monthKey);
  const rows: ActivityFeedRow[] = [];

  for (const e of ctx.entries) {
    const slice = sliceForMonth(e, ctx.monthKey);
    // Same fallback strategy the legacy activity loop used: even
    // when the entry has no slice this month (Wallet partial without
    // chargeDate, future-installment kickoff), surface it on its
    // source timestamp so the user still sees it.
    const sourceIso = e.occurredAt ?? e.chargeDate ?? e.createdAt;
    let whenISO: string;
    let amount: number;
    let hasRealTime = false;
    if (slice) {
      whenISO = slice.chargeDate.toISOString();
      amount = slice.amount;
      if (sourceIso) {
        const src = new Date(sourceIso);
        if (
          !Number.isNaN(src.getTime()) &&
          src.getFullYear() === slice.chargeDate.getFullYear() &&
          src.getMonth() === slice.chargeDate.getMonth() &&
          src.getDate() === slice.chargeDate.getDate()
        ) {
          whenISO = src.toISOString();
          hasRealTime = true;
        }
      }
    } else {
      if (!sourceIso) continue;
      const d = new Date(sourceIso);
      if (Number.isNaN(d.getTime())) continue;
      whenISO = d.toISOString();
      hasRealTime = true;
      amount = Math.abs(e.amount) / Math.max(1, e.installments);
    }

    rows.push({
      refId: `entry:${e.id}`,
      entryId: e.id,
      direction: e.isRefund ? "in" : "out",
      amount,
      whenISO,
      hasRealTime,
      title: e.merchant ?? e.note ?? e.category,
      category: e.category,
      source: e.source,
      installments: e.installments,
      isRefund: Boolean(e.isRefund),
      bankPending: Boolean(e.bankPending),
      needsConfirmation: Boolean(e.needsConfirmation && !e.confirmedAt),
      excludeFromBudget: Boolean(e.excludeFromBudget),
      isWithdrawal: e.transactionType === "withdrawal",
      cardLast4: e.cardLast4,
      paySource: paySourceFor(e),
    });
  }

  rows.sort(
    (a, b) => new Date(b.whenISO).getTime() - new Date(a.whenISO).getTime(),
  );

  return {
    rows,
    dataSources: ["entries(occurredAt|chargeDate|createdAt)", "sliceForMonth"],
    window: { from, to, monthKey: ctx.monthKey },
  };
}

// ── 7c. getManualTransactions ──────────────────────────────────────
//
// Phase 397 — canonical "what did I manually log this month" view.
// Splits manual entries by payment method so the cockpit can show
// the cash subtotal in the cash lane and the credit subtotal in
// the credit lane without either falling through the cracks.
//
// Closes the user-reported ₪10 drift: a paymentMethod="cash" σόπer
// entry was visible in donut/CategorySpendCard (which sums every
// payment method) but invisible to the cockpit's "תיעוד ידני" tile
// (credit-only) and the cards-screen "חד-פעמיים" filter (credit-
// only). The cockpit's cash lane breakdown now surfaces it.

export type ManualTransactionsResult = {
  total: number;
  credit: number;
  cash: number;
  rows: EngineRow[];
  window: EngineWindow;
  dataSources: string[];
};

export function getManualTransactions(
  ctx: EngineCtx,
): ManualTransactionsResult {
  const { from, to } = monthWindow(ctx.monthKey);
  let credit = 0;
  let cash = 0;
  const rows: EngineRow[] = [];
  for (const e of ctx.entries) {
    if (e.source !== "manual") continue;
    if (e.isRefund) continue;
    if (e.excludeFromBudget) continue;
    if (e.needsConfirmation && !e.confirmedAt) continue;
    if (e.bankPending) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (e.transactionType === "withdrawal") continue;
    const slice = sliceForMonth(e, ctx.monthKey);
    if (!slice) continue;
    if (e.paymentMethod === "credit") credit += slice.amount;
    else cash += slice.amount;
    rows.push({
      refId: `entry:${e.id}`,
      label: e.merchant ?? e.note ?? e.category,
      amount: slice.amount,
      source: "manual",
      kind: "entry",
      category: e.category,
      meta: {
        paymentMethod: e.paymentMethod,
        chargeDate: slice.chargeDate.toISOString(),
      },
    });
  }
  return {
    total: credit + cash,
    credit,
    cash,
    rows,
    window: { from, to, monthKey: ctx.monthKey },
    dataSources: ["entries(source=manual)", "sliceForMonth"],
  };
}

// ── 8b. getCreditExposureByCard ────────────────────────────────────
//
// Phase 396 — returns the canonical per-card statement so the Cards
// screen can render grouped rows without importing the underlying
// helper directly. Same data as getCreditExposure; presented per card.

export function getCreditExposureByCard(ctx: EngineCtx): CreditCardStatement {
  return getCreditCardStatement({
    accounts: ctx.accounts,
    rules: ctx.rules,
    entries: ctx.entries,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  });
}

// ── 9. getRecurringCommitmentsByCategory ───────────────────────────
//
// Phase 396 — per-category recurring-rule overlay. Same canonical
// filter (active + scheduled + not paid). Returns each category's
// pending-rule subtotal so CategorySpendCard can show "מתוכם ₪X
// קבועים צפויים" without ever adding rules to its visible total
// (the total remains getCategoryBreakdown.total — actuals only).

export type RecurringCommitmentRow = {
  ruleId: string;
  label: string;
  amount: number;
  dayOfMonth: number;
  category: CategoryId;
};

export type RecurringByCategory = {
  total: number;
  byCategory: Map<CategoryId, { total: number; rules: RecurringCommitmentRow[] }>;
  dataSources: string[];
  window: EngineWindow;
};

export function getRecurringCommitmentsByCategory(
  ctx: EngineCtx,
): RecurringByCategory {
  const { from, to } = monthWindow(ctx.monthKey);
  const byCategory = new Map<
    CategoryId,
    { total: number; rules: RecurringCommitmentRow[] }
  >();
  let total = 0;
  for (const pr of pendingRulesForMonth({
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  })) {
    const cat = pr.rule.category as CategoryId;
    const entry = byCategory.get(cat) ?? { total: 0, rules: [] };
    entry.total += pr.rule.estimatedAmount;
    entry.rules.push({
      ruleId: pr.rule.id,
      label: pr.rule.label,
      amount: pr.rule.estimatedAmount,
      dayOfMonth: pr.rule.dayOfMonth,
      category: cat,
    });
    byCategory.set(cat, entry);
    total += pr.rule.estimatedAmount;
  }
  return {
    total,
    byCategory,
    dataSources: ["pendingRulesForMonth"],
    window: { from, to, monthKey: ctx.monthKey },
  };
}

// ── 10. getCardFolderView ──────────────────────────────────────────
//
// Phase 396 — per-card per-billing-month folder lens. Replaces the
// independent buildCardCategoryBreakdown + buildCardMonthFolders
// calculators that drifted from the canonical credit exposure.
//
// Every numeric value here is derived from the SAME getCreditExposure
// data the cockpit + cards header consume — guaranteeing:
//   header total === Σ folder.total === Σ card.total

export type CardFolderKind = "recurring" | "installment" | "oneTime";

export type CardFolderRow = {
  refId: string;
  label: string;
  amount: number;
  kind: CardFolderKind;
  category?: CategoryId;
};

export type CardFolder = {
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  total: number;
  recurringTotal: number;
  installmentsTotal: number;
  oneTimeTotal: number;
  rows: CardFolderRow[];
};

export type CardFolderView = {
  total: number;
  folders: CardFolder[];
  /** Unassigned credit rows (no resolvable card). */
  unassigned: {
    total: number;
    rows: CardFolderRow[];
  };
  dataSources: string[];
  window: EngineWindow;
};

function bucketToFolderKind(
  bucket: string,
  refId: string,
  rules: RecurringRule[],
): CardFolderKind {
  // Rules: installment-plan rule → "installment"; regular bill →
  // "recurring".
  if (refId.startsWith("rule:")) {
    const ruleId = refId.slice("rule:".length);
    const r = rules.find((x) => x.id === ruleId);
    if (r && r.installmentTotal && r.installmentTotal > 1) return "installment";
    return "recurring";
  }
  if (bucket === "existingInstallments") return "installment";
  return "oneTime";
}

export function getCardFolderView(ctx: EngineCtx): CardFolderView {
  const { from, to } = monthWindow(ctx.monthKey);
  const statement = getCreditCardStatement({
    accounts: ctx.accounts,
    rules: ctx.rules,
    entries: ctx.entries,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  });

  const folders: CardFolder[] = statement.cards.map((card) => {
    let recurringTotal = 0;
    let installmentsTotal = 0;
    let oneTimeTotal = 0;
    const rows: CardFolderRow[] = card.transactions.map((tx) => {
      const kind = bucketToFolderKind(tx.bucket, tx.id, ctx.rules);
      if (kind === "recurring") recurringTotal += tx.amount;
      else if (kind === "installment") installmentsTotal += tx.amount;
      else oneTimeTotal += tx.amount;
      return {
        refId: tx.id,
        label: tx.label,
        amount: tx.amount,
        kind,
        category: tx.category,
      };
    });
    return {
      cardId: card.cardId,
      cardLabel: card.cardLabel,
      cardLast4: card.cardLast4,
      total: card.total,
      recurringTotal,
      installmentsTotal,
      oneTimeTotal,
      rows,
    };
  });

  const unassignedRows: CardFolderRow[] = statement.unassigned.transactions.map(
    (tx) => ({
      refId: tx.id,
      label: tx.label,
      amount: tx.amount,
      kind: bucketToFolderKind(tx.bucket, tx.id, ctx.rules),
      category: tx.category,
    }),
  );

  return {
    total: statement.total,
    folders,
    unassigned: {
      total: statement.unassigned.total,
      rows: unassignedRows,
    },
    dataSources: ["getCreditCardStatement"],
    window: { from, to, monthKey: ctx.monthKey },
  };
}

// ── Convenience: build ctx from store-shaped args ──────────────────

export function buildEngineCtx(args: {
  accounts: Account[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  now?: Date;
  monthKey?: MonthKey;
}): EngineCtx {
  const now = args.now ?? new Date();
  const monthKey = args.monthKey ?? monthKeyOf(now);
  return {
    monthKey,
    now,
    accounts: args.accounts,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    loans: args.loans,
    incomes: args.incomes,
    monthlyBudget: args.monthlyBudget,
  };
}

// ── Reconciliation surface ─────────────────────────────────────────
//
// Used by tests/reconciliation.test.ts (and a future dev panel) to
// compare engine totals against canonical-helper totals.

export type ReconciliationRow = {
  surface: string;
  engineFn: string;
  helperFn: string;
  engineTotal: number;
  helperTotal: number;
  delta: number;
  ok: boolean;
  missingFromEngine?: Array<{ refId: string; amount: number; source: string }>;
  missingFromHelper?: Array<{ refId: string; amount: number; source: string }>;
};

export function buildReconciliation(ctx: EngineCtx): ReconciliationRow[] {
  const rows: ReconciliationRow[] = [];
  // Phase 396 — strict tolerance now that engine emits raw floats.
  // Any drift > ₪0.01 indicates a real divergence, not rounding.
  const within1 = (n: number) => Math.abs(n) <= 0.01;

  // 1. Credit exposure — three helpers must agree on one number.
  const credit = getCreditExposure(ctx);
  const exposure = getCreditCardExposure({
    rules: ctx.rules,
    entries: ctx.entries,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  });
  rows.push({
    surface: "Credit Cards (per-card statement)",
    engineFn: "getCreditExposure",
    helperFn: "getCreditCardExposure.totalExpectedCharge",
    engineTotal: credit.total,
    helperTotal: Math.round(exposure.totalExpectedCharge),
    delta: credit.total - Math.round(exposure.totalExpectedCharge),
    ok: within1(credit.total - Math.round(exposure.totalExpectedCharge)),
  });

  const obligation = getMonthlyObligationBreakdown({
    rules: ctx.rules,
    loans: ctx.loans,
    entries: ctx.entries,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
  });
  rows.push({
    surface: "Expenses cockpit (credit lane)",
    engineFn: "getCreditExposure",
    helperFn: "getMonthlyObligationBreakdown.creditCardsTotal",
    engineTotal: credit.total,
    helperTotal: obligation.creditCardsTotal,
    delta: credit.total - obligation.creditCardsTotal,
    ok: within1(credit.total - obligation.creditCardsTotal),
  });

  // 2. Category breakdown total === Σ categoryTotals.
  const cat = getCategoryBreakdown(ctx);
  const helperCatSum = Array.from(
    categoryTotals({
      entries: ctx.entries,
      monthKey: ctx.monthKey,
      now: ctx.now,
    }).values(),
  ).reduce((s, n) => s + n, 0);
  rows.push({
    surface: "Where Money Goes (categories)",
    engineFn: "getCategoryBreakdown",
    helperFn: "Σ categoryTotals",
    engineTotal: cat.total,
    helperTotal: helperCatSum,
    delta: cat.total - helperCatSum,
    ok: within1(cat.total - helperCatSum),
  });

  // 3. Monthly expenses — projectMonth's projected total.
  const monthly = getMonthlyExpenses(ctx);
  const pm = projectMonth({
    entries: ctx.entries,
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthKey: ctx.monthKey,
    now: ctx.now,
  });
  // Reproduce projectMonth's per-entry contribution so we can name
  // which transactions caused any divergence vs the engine.
  const helperEntryContributions = new Map<string, number>();
  for (const e of ctx.entries) {
    if (e.needsConfirmation && !e.confirmedAt) continue;
    if (e.bankPending) continue;
    const slice = sliceForMonth(e, ctx.monthKey);
    if (!slice) continue;
    helperEntryContributions.set(`entry:${e.id}`, slice.amount);
  }
  const engineEntryContributions = new Map<string, number>();
  for (const r of monthly.rows) {
    if (r.kind === "entry") engineEntryContributions.set(r.refId, r.amount);
  }
  const missingFromEngine: ReconciliationRow["missingFromEngine"] = [];
  const missingFromHelper: ReconciliationRow["missingFromHelper"] = [];
  for (const [refId, amt] of helperEntryContributions) {
    if (!engineEntryContributions.has(refId)) {
      const e = ctx.entries.find((x) => `entry:${x.id}` === refId);
      missingFromEngine.push({
        refId,
        amount: amt,
        source: e ? entryEngineSource(e) : "?",
      });
    }
  }
  for (const [refId, amt] of engineEntryContributions) {
    if (!helperEntryContributions.has(refId)) {
      const e = ctx.entries.find((x) => `entry:${x.id}` === refId);
      missingFromHelper.push({
        refId,
        amount: amt,
        source: e ? entryEngineSource(e) : "?",
      });
    }
  }
  rows.push({
    surface: "Home — projected month total",
    engineFn: "getMonthlyExpenses",
    helperFn: "projectMonth.projected",
    engineTotal: monthly.total,
    helperTotal: pm.projected,
    delta: monthly.total - pm.projected,
    ok: within1(monthly.total - pm.projected),
    missingFromEngine,
    missingFromHelper,
  });

  // 4. Income total.
  const income = getMonthlyIncome(ctx);
  const ib = incomeBreakdown({
    incomes: ctx.incomes,
    entries: ctx.entries,
    monthKey: ctx.monthKey,
    now: ctx.now,
  });
  rows.push({
    surface: "Home — monthly income",
    engineFn: "getMonthlyIncome",
    helperFn: "incomeBreakdown.totalMonthly",
    engineTotal: income.total,
    helperTotal: ib.totalMonthly,
    delta: income.total - ib.totalMonthly,
    ok: within1(income.total - ib.totalMonthly),
  });

  // 5. Future cash flow.
  const ff = getFutureCashFlow(ctx);
  const buckets = buildCashFlowBuckets({
    accounts: ctx.accounts,
    loans: ctx.loans,
    rules: ctx.rules,
    statuses: ctx.statuses,
    entries: ctx.entries,
    now: ctx.now,
    windowDays: 35,
  });
  rows.push({
    surface: "Insights — cashflow buckets (35d)",
    engineFn: "getFutureCashFlow",
    helperFn: "buildCashFlowBuckets.totalCommitted",
    engineTotal: ff.total,
    helperTotal: buckets.totalCommitted,
    delta: ff.total - buckets.totalCommitted,
    ok: within1(ff.total - buckets.totalCommitted),
  });

  // 6. Timeline EOM.
  const tl = getTimelineProjection(ctx);
  const snap = buildFinancialSnapshot({
    accounts: ctx.accounts,
    loans: ctx.loans,
    incomes: ctx.incomes,
    entries: ctx.entries,
    rules: ctx.rules,
    statuses: ctx.statuses,
    monthlyBudget: ctx.monthlyBudget,
    now: ctx.now,
    monthKey: ctx.monthKey,
  });
  rows.push({
    surface: "Time — EOM projection",
    engineFn: "getTimelineProjection.endOfMonth",
    helperFn: "buildFinancialSnapshot.projectedBalanceOnFirstOfNextMonth",
    engineTotal: tl.endOfMonth,
    helperTotal: snap.projectedBalanceOnFirstOfNextMonth,
    delta: tl.endOfMonth - snap.projectedBalanceOnFirstOfNextMonth,
    ok: within1(tl.endOfMonth - snap.projectedBalanceOnFirstOfNextMonth),
  });

  return rows;
}
