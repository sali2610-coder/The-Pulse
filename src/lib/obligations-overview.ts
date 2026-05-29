// Phase 317 — Home "חיובים קבועים והלוואות" overview engine.
//
// Single source of truth for the section: surfaces ALL loans (active
// in this month, starting within the next month, OR ending within
// the next 3 months) plus every recurring rule that classifies into
// the housing bucket, enriched with the data the row UI needs:
//
//   • monthlyAmount       — what fires this month (₪)
//   • nextChargeDate      — next concrete charge date (this month if
//                           upcoming, otherwise next month)
//   • source              — "bank" / "card" / "cash" / "unknown"
//   • sourceLabel         — display string ("בנק" / "Visa ****7093")
//   • status              — "starting-soon" / "active" / "ending-soon"
//   • remainingPayments   — leftover installments incl. this month
//
// Pure compute. No mutation, no persistence. Consumers: the new
// MonthlyObligationsHeader (3 KPI tiles), the rewritten
// LoanSummaryCard (per-loan list), and the enriched HousingCard.

import type {
  Account,
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import {
  addMonths,
  dayWithinMonth,
  monthIndex,
  monthKeyOf,
} from "@/lib/dates";
import { loanSchedule } from "@/lib/installment-schedule";
import {
  buildHousingBucket,
  type HousingSubcategory,
  HOUSING_SUBCAT_LABEL,
} from "@/lib/housing-bucket";

export type ObligationSource = "bank" | "card" | "cash" | "unknown";
export type LoanStatus = "starting-soon" | "active" | "ending-soon";

export type LoanRow = {
  loan: Loan;
  /** Charged this month (₪). Zero when the loan hasn't started yet. */
  monthlyAmount: number;
  /** Next concrete charge date — this month if dayOfMonth >= today,
   *  otherwise next month's dayOfMonth. */
  nextChargeDate: Date;
  /** Stage of the loan relative to `monthKey`. */
  status: LoanStatus;
  /** Source channel. Loans currently have no explicit source field, so
   *  the resolver returns "bank" by convention. Kept as an explicit
   *  field so future schema additions can override per loan. */
  source: ObligationSource;
  sourceLabel: string;
  /** Payments left INCLUDING this month. Undefined for open-ended
   *  legacy loans without start/total. */
  remainingPayments?: number;
  /** "57/72" — undefined when paymentNumber/total isn't known. */
  paymentLabel?: string;
  /** End month for the schedule, if finite. */
  endMonthKey?: MonthKey;
};

export type HousingRow = {
  sub: HousingSubcategory;
  label: string;
  rules: RecurringRule[];
  ruleCount: number;
  monthlyTotal: number;
  /** Earliest upcoming charge date among the rules in this row. */
  nextChargeDate: Date;
  /** Distinct sources across the rules (e.g. ["card","bank"]). */
  sources: ObligationSource[];
  sourceLabel: string;
};

export type ObligationsOverview = {
  monthKey: MonthKey;
  /** Σ loansMonthly + recurringMonthly. */
  monthlyTotal: number;
  loansMonthly: number;
  recurringMonthly: number;
  loans: LoanRow[];
  housing: HousingRow[];
};

const SOURCE_LABEL: Record<ObligationSource, string> = {
  bank: "בנק",
  card: "אשראי",
  cash: "מזומן",
  unknown: "—",
};

function resolveCardLabel(
  cardId: string | undefined,
  accounts: Account[],
): string {
  if (!cardId) return SOURCE_LABEL.card;
  const acc = accounts.find((a) => a.id === cardId);
  if (!acc) return SOURCE_LABEL.card;
  if (acc.cardLast4) return `${acc.label} ****${acc.cardLast4}`;
  return acc.label || SOURCE_LABEL.card;
}

function ruleSourceLabel(
  rule: RecurringRule,
  accounts: Account[],
): { source: ObligationSource; label: string } {
  const source = (rule.paymentSource ?? "unknown") as ObligationSource;
  if (source === "card") {
    return { source, label: resolveCardLabel(rule.linkedCardId, accounts) };
  }
  return { source, label: SOURCE_LABEL[source] };
}

function nextChargeDateFor(dayOfMonth: number, now: Date): Date {
  const clampedDay = Math.max(1, Math.min(31, Math.round(dayOfMonth)));
  const todayKey = monthKeyOf(now);
  const thisMonth = dayWithinMonth(todayKey, clampedDay);
  if (thisMonth.getTime() >= startOfDay(now).getTime()) return thisMonth;
  return dayWithinMonth(addMonths(todayKey, 1), clampedDay);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function loanStatusFor(args: {
  loan: Loan;
  monthKey: MonthKey;
  isFuture: boolean;
  isActiveNow: boolean;
  remaining: number | undefined;
  endMonthKey: MonthKey | undefined;
  horizonMonths: number;
}): LoanStatus {
  // Starting next month or within `horizonMonths`?
  if (args.isFuture && args.loan.startMonth && args.loan.startYear) {
    const startIdx = args.loan.startYear * 12 + (args.loan.startMonth - 1);
    const monthsUntilStart = startIdx - monthIndex(args.monthKey);
    if (monthsUntilStart >= 0 && monthsUntilStart <= 1) return "starting-soon";
  }
  // Ending within the horizon (3 months by default)?
  if (
    args.endMonthKey &&
    monthIndex(args.endMonthKey) - monthIndex(args.monthKey) <=
      args.horizonMonths &&
    args.isActiveNow
  ) {
    return "ending-soon";
  }
  if (
    args.remaining !== undefined &&
    args.remaining <= args.horizonMonths &&
    args.isActiveNow
  ) {
    return "ending-soon";
  }
  return "active";
}

export function buildObligationsOverview(args: {
  loans: Loan[];
  rules: RecurringRule[];
  accounts: Account[];
  monthKey: MonthKey;
  now?: Date;
  /** Months ahead to consider for "starting-soon" / "ending-soon". */
  horizonMonths?: number;
}): ObligationsOverview {
  const now = args.now ?? new Date();
  const horizonMonths = args.horizonMonths ?? 3;

  // ── Loans ─────────────────────────────────────────────────────
  const loanRows: LoanRow[] = [];
  let loansMonthly = 0;

  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);

    // Surface loans firing now OR firing within `horizonMonths` from
    // here. Legacy open-ended schedules without start/total still
    // count as active (sched.active === true).
    const isActiveNow = sched.active;
    let include = false;
    if (isActiveNow) include = true;
    if (sched.isFuture && loan.startMonth && loan.startYear) {
      const startIdx = loan.startYear * 12 + (loan.startMonth - 1);
      const monthsUntil = startIdx - monthIndex(args.monthKey);
      if (monthsUntil >= 0 && monthsUntil <= horizonMonths) include = true;
    }
    if (!include) continue;

    const monthlyAmount = isActiveNow ? loan.monthlyInstallment : 0;
    loansMonthly += monthlyAmount;

    const remainingPayments =
      sched.remaining !== undefined ? sched.remaining + 1 : undefined;
    const paymentLabel =
      sched.paymentNumber !== undefined && sched.totalPayments !== undefined
        ? `${sched.paymentNumber}/${sched.totalPayments}`
        : undefined;

    loanRows.push({
      loan,
      monthlyAmount,
      nextChargeDate: nextChargeDateFor(loan.dayOfMonth, now),
      status: loanStatusFor({
        loan,
        monthKey: args.monthKey,
        isFuture: !!sched.isFuture,
        isActiveNow,
        remaining: sched.remaining,
        endMonthKey: sched.endMonthKey,
        horizonMonths,
      }),
      source: "bank",
      sourceLabel: SOURCE_LABEL.bank,
      remainingPayments,
      paymentLabel,
      endMonthKey: sched.endMonthKey,
    });
  }

  // Sort: ending-soon first (urgency), then by next charge date.
  const STATUS_ORDER: Record<LoanStatus, number> = {
    "ending-soon": 0,
    active: 1,
    "starting-soon": 2,
  };
  loanRows.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.nextChargeDate.getTime() - b.nextChargeDate.getTime();
  });

  // ── Housing rows ──────────────────────────────────────────────
  const housingBucket = buildHousingBucket({
    rules: args.rules,
    totalMonthlyIncome: 0,
    monthKey: args.monthKey,
  });

  const housing: HousingRow[] = housingBucket.rows.map((row) => {
    // Earliest upcoming charge across the rules in the row.
    let earliest: Date | null = null;
    const sourceSet = new Set<ObligationSource>();
    let cardLabelHint: string | null = null;
    for (const r of row.rules) {
      const d = nextChargeDateFor(r.dayOfMonth, now);
      if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
      const { source, label } = ruleSourceLabel(r, args.accounts);
      sourceSet.add(source);
      if (source === "card" && !cardLabelHint) cardLabelHint = label;
    }
    const sources = Array.from(sourceSet);
    const sourceLabel =
      sources.length === 1
        ? sources[0] === "card" && cardLabelHint
          ? cardLabelHint
          : SOURCE_LABEL[sources[0]!]
        : sources.map((s) => SOURCE_LABEL[s]).join(" / ");

    return {
      sub: row.sub,
      label: HOUSING_SUBCAT_LABEL[row.sub],
      rules: row.rules,
      ruleCount: row.rules.length,
      monthlyTotal: row.monthlyTotal,
      nextChargeDate: earliest ?? now,
      sources,
      sourceLabel,
    };
  });

  const recurringMonthly = housing.reduce((s, r) => s + r.monthlyTotal, 0);

  return {
    monthKey: args.monthKey,
    monthlyTotal: loansMonthly + recurringMonthly,
    loansMonthly,
    recurringMonthly,
    loans: loanRows,
    housing,
  };
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  "starting-soon": "יורד בקרוב",
  active: "פעיל",
  "ending-soon": "מסתיים בקרוב",
};

export const SOURCE_LABEL_MAP = SOURCE_LABEL;
