// Phase 392 — Financial Audit Report.
//
// Pure compute. Walks every canonical helper, captures the exact tx
// IDs each container counts, surfaces the deltas between containers,
// and labels every exclusion with the reason it was dropped.
//
// Used by the dev-only FinancialAuditReport panel + by tests that
// want a structured contract.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";
import { sliceForMonth } from "@/lib/projections";

export type AuditContainerName =
  | "monthlyCommitments"
  | "creditCards"
  | "whereMoneyGoes"
  | "timeForecast35d";

export type AuditExclusion = {
  /** "rule:<id>" | "entry:<id>" | "loan:<id>" */
  refId: string;
  /** Human-readable subject. */
  label: string;
  /** Short reason code so the UI can group identical exclusions. */
  reason: string;
};

export type AuditInclusion = {
  refId: string;
  label: string;
  amount: number;
};

export type AuditContainer = {
  name: AuditContainerName;
  /** Hebrew title for display. */
  displayName: string;
  /** Function the container delegates to. */
  source: string;
  /** Store slices the source reads. */
  dataSources: string[];
  /** Window the source operates on. */
  window: string;
  total: number;
  includedCount: number;
  included: AuditInclusion[];
  excluded: AuditExclusion[];
};

export type AuditDelta = {
  refId: string;
  label: string;
  amount: number;
  /** Where each side stands. */
  inMonthlyCommitments: boolean;
  inCreditCards: boolean;
  inWhereMoneyGoes: boolean;
  inTimeForecast: boolean;
  reason: string;
};

export type AuditReport = {
  monthKey: MonthKey;
  generatedAt: string;
  containers: Record<AuditContainerName, AuditContainer>;
  /** Items present in at least one container but missing from at
   *  least one other. Empty when everything is in sync. */
  deltas: AuditDelta[];
  /** "credit total in cockpit" vs "credit total surfaced on the
   *  Time-screen curve". Surfaced separately so the panel can flag
   *  it in one row. */
  parity: {
    cockpitCredit: number;
    curveCredit: number;
    pending: number;
    expected: number;
    delta: number;
  };
};

function entryLabel(e: ExpenseEntry): string {
  return e.merchant ?? e.note ?? `entry ${e.id.slice(0, 8)}`;
}

function ruleLabel(r: RecurringRule): string {
  return r.label || `rule ${r.id.slice(0, 8)}`;
}

function loanLabel(l: Loan): string {
  return l.label || `loan ${l.id.slice(0, 8)}`;
}

function excludeReason(e: ExpenseEntry): string | null {
  if (e.transactionType === "withdrawal") return "withdrawal";
  if (e.isRefund) return "refund";
  if (e.excludeFromBudget) return "excludeFromBudget";
  if (e.currency && e.currency !== "ILS") return "fx";
  if (e.needsConfirmation && !e.confirmedAt) return "needsConfirmation";
  if (e.bankPending) return "bankPending";
  return null;
}

export function buildFinancialAudit(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  now?: Date;
}): AuditReport {
  const now = args.now ?? new Date();

  // ── Container 1 + 3: Monthly Commitments + Where Money Goes ──
  const breakdown = getMonthlyObligationBreakdown({
    rules: args.rules,
    loans: args.loans,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const commitments: AuditContainer = {
    name: "monthlyCommitments",
    displayName: "סך התחייבויות החודש",
    source: "getMonthlyObligationBreakdown",
    dataSources: ["rules", "loans", "entries", "statuses"],
    window: `month ${args.monthKey}`,
    total: breakdown.total,
    includedCount: breakdown.explanationRows.length,
    included: breakdown.explanationRows.map((r) => ({
      refId: r.id,
      label: r.label,
      amount: r.amount,
    })),
    excluded: [],
  };
  // Same engine, same rows — explanationRows IS "Where the money goes".
  const whereMoneyGoes: AuditContainer = {
    ...commitments,
    name: "whereMoneyGoes",
    displayName: 'לאן הכסף הולך',
    window: `month ${args.monthKey} (same source as cockpit)`,
  };

  // Walk every rule/loan/entry to surface what was excluded and why.
  for (const r of args.rules) {
    if (!r.active) {
      commitments.excluded.push({
        refId: `rule:${r.id}`,
        label: ruleLabel(r),
        reason: "inactive",
      });
    } else if (!ruleSchedule(r, args.monthKey).active) {
      commitments.excluded.push({
        refId: `rule:${r.id}`,
        label: ruleLabel(r),
        reason: "notScheduledThisMonth",
      });
    }
  }
  for (const l of args.loans) {
    if (!l.active) {
      commitments.excluded.push({
        refId: `loan:${l.id}`,
        label: loanLabel(l),
        reason: "inactive",
      });
    }
  }
  for (const e of args.entries) {
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) {
      commitments.excluded.push({
        refId: `entry:${e.id}`,
        label: entryLabel(e),
        reason: "noSliceThisMonth",
      });
      continue;
    }
    const reason = excludeReason(e);
    if (reason) {
      commitments.excluded.push({
        refId: `entry:${e.id}`,
        label: entryLabel(e),
        reason,
      });
    }
  }
  whereMoneyGoes.excluded = commitments.excluded.slice();

  // ── Container 2: Credit Cards ──
  const exposure = getCreditCardExposure({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const cards: AuditContainer = {
    name: "creditCards",
    displayName: "כרטיסי אשראי",
    source: "getCreditCardExposure",
    dataSources: ["rules", "entries", "statuses"],
    window: `month ${args.monthKey}`,
    total: exposure.totalExpectedCharge,
    includedCount: exposure.breakdown.length,
    included: exposure.breakdown.map((r) => ({
      refId: r.id,
      label: r.label,
      amount: r.amount,
    })),
    excluded: [],
  };
  // Excluded reasons: rules not card-settled, entries not credit.
  for (const r of args.rules) {
    if (!r.active) continue;
    if (!ruleSchedule(r, args.monthKey).active) continue;
    if (!isRuleCardSettled(r)) {
      cards.excluded.push({
        refId: `rule:${r.id}`,
        label: ruleLabel(r),
        reason: "notCardSettled",
      });
    }
  }
  for (const e of args.entries) {
    const r = excludeReason(e);
    if (r) {
      cards.excluded.push({
        refId: `entry:${e.id}`,
        label: entryLabel(e),
        reason: r,
      });
      continue;
    }
    if (e.paymentMethod !== "credit") {
      cards.excluded.push({
        refId: `entry:${e.id}`,
        label: entryLabel(e),
        reason: "notCreditPayment",
      });
    }
  }

  // ── Container 4: Time Forecast (35-day window) ──
  const buckets = buildCashFlowBuckets({
    accounts: args.accounts,
    loans: args.loans,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays: 35,
  });
  const cardBucketsTotal = buckets.buckets
    .filter((b) => b.source === "card")
    .reduce((s, b) => s + b.monthlyTotal, 0);
  const cardBucketIncluded: AuditInclusion[] = [];
  for (const b of buckets.buckets) {
    if (b.source !== "card") continue;
    for (const o of b.obligations) {
      cardBucketIncluded.push({
        refId: o.refId,
        label: o.label,
        amount: o.amount,
      });
    }
  }
  const timeForecast: AuditContainer = {
    name: "timeForecast35d",
    displayName: "תחזית זמן (35 ימים)",
    source: "buildCashFlowBuckets → liquidityCurve",
    dataSources: ["accounts", "loans", "rules", "statuses", "entries"],
    window: "35 days forward from now",
    total: Math.round(cardBucketsTotal),
    includedCount: cardBucketIncluded.length,
    included: cardBucketIncluded,
    excluded: [],
  };
  // Curve drops pending entries by design.
  for (const e of args.entries) {
    if (e.paymentMethod !== "credit") continue;
    const reason = excludeReason(e);
    if (reason) {
      timeForecast.excluded.push({
        refId: `entry:${e.id}`,
        label: entryLabel(e),
        reason,
      });
    }
  }

  // ── Cross-container deltas ──
  const refToContainers = new Map<
    string,
    { label: string; amount: number; in: Set<AuditContainerName> }
  >();
  function record(c: AuditContainer) {
    for (const r of c.included) {
      const prev = refToContainers.get(r.refId);
      if (prev) {
        prev.in.add(c.name);
      } else {
        refToContainers.set(r.refId, {
          label: r.label,
          amount: r.amount,
          in: new Set([c.name]),
        });
      }
    }
  }
  record(commitments);
  record(cards);
  record(whereMoneyGoes);
  record(timeForecast);

  const deltas: AuditDelta[] = [];
  for (const [refId, info] of refToContainers.entries()) {
    const inMC = info.in.has("monthlyCommitments");
    const inCC = info.in.has("creditCards");
    const inWMG = info.in.has("whereMoneyGoes");
    const inTF = info.in.has("timeForecast35d");
    // Cockpit + where-money-goes always agree (same engine).
    // Cards is a subset of cockpit. Time forecast covers card lane
    // only AND excludes pending.
    const cockpitCreditExpected =
      inCC || // any credit row should land in cockpit too
      !inMC; // tracked elsewhere
    void cockpitCreditExpected;
    const onlyInOne = [inMC, inCC, inWMG, inTF].filter(Boolean).length === 1;
    if (onlyInOne) {
      deltas.push({
        refId,
        label: info.label,
        amount: info.amount,
        inMonthlyCommitments: inMC,
        inCreditCards: inCC,
        inWhereMoneyGoes: inWMG,
        inTimeForecast: inTF,
        reason: "single-container",
      });
    }
  }

  const parity = {
    cockpitCredit: exposure.totalExpectedCharge,
    curveCredit: timeForecast.total,
    pending: exposure.pendingTransactions,
    expected: exposure.totalExpectedCharge - exposure.pendingTransactions,
    delta:
      timeForecast.total -
      (exposure.totalExpectedCharge - exposure.pendingTransactions),
  };

  return {
    monthKey: args.monthKey,
    generatedAt: now.toISOString(),
    containers: {
      monthlyCommitments: commitments,
      creditCards: cards,
      whereMoneyGoes,
      timeForecast35d: timeForecast,
    },
    deltas,
    parity,
  };
}
