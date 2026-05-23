// Phase 207 — Safe-to-Spend until next salary.
//
// Heart of the cashflow-OS direction. Answers the main question:
//
//   "If I continue spending normally, where will I stand on the
//    first day of next salary's window?"
//
// Inputs come from the canonical store. Math composes existing
// engine outputs through the NEW `effectiveCashDate` lens so card
// purchases land on their real debit dates, not their purchase
// dates.
//
// Formula (per dispatch from product brief):
//
//   currentBalance
// + future salaries up to nextSalaryDate
// − future card settlements (effective-cash-date in window)
// − future loan installments in window
// − future recurring rule charges in window
// − future installment slices in window (already covered by card
//   settlements above when paid via card; we de-dupe so we don't
//   subtract the same slice twice)
// − burn-rate cushion (recent daily outflow × days remaining)
//
//   = safeToSpendUntilNext

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { ruleSchedule } from "@/lib/installment-schedule";
import { effectiveCashImpactStream } from "@/lib/effective-cash-date";

export type SafeToSpendVibe = "calm" | "tight" | "danger";

export type SafeToSpendReport = {
  /** ISO of the next expected salary date. Null when no incomes
   *  are scheduled. */
  nextSalaryAtISO: string | null;
  /** Number of days between now and the next salary date. */
  daysUntilNextSalary: number;
  /** Σ active bank anchors. Can be negative (overdrawn). */
  currentBalance: number;
  /** Salary inflow inside the window — income records with
   *  dayOfMonth landing strictly AFTER today, up to and INCLUDING
   *  the chosen next-salary anchor. */
  expectedSalaryInflow: number;
  /** Card-driven debits: sum of slice impacts whose effective-cash-
   *  date falls inside (now, nextSalaryAt]. */
  expectedCardSettlements: number;
  /** Loan installments inside the window. Uses Loan.dayOfMonth as
   *  the cash hit date. */
  expectedLoanDebits: number;
  /** Recurring rule charges inside the window (active + not paid). */
  expectedRecurringDebits: number;
  /** Heuristic cushion: trailing-7-day average daily outflow * days
   *  remaining. Represents normal day-to-day spend not captured by
   *  the structured projections above. Always ≥ 0. */
  dailyBurnCushion: number;
  /** Final answer — what's actually safe to spend until next salary. */
  safeToSpend: number;
  /** Coarse vibe bucket for UI tone. */
  vibe: SafeToSpendVibe;
  /** Trailing 7-day average daily outflow (informational). */
  dailyBurnAverage: number;
};

const DEFAULT_BURN_WINDOW_DAYS = 7;

export function safeToSpendUntilNextSalary(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  now?: Date;
  /** Override the burn-rate window. Default 7 days. */
  burnWindowDays?: number;
}): SafeToSpendReport {
  const now = args.now ?? new Date();
  const burnDays = Math.max(1, args.burnWindowDays ?? DEFAULT_BURN_WINDOW_DAYS);

  const currentBalance = sumAnchors(args.accounts);
  const next = nextSalaryDate({ incomes: args.incomes, now });
  const horizon = next?.date ?? endOfNextMonth(now);
  const daysUntilNextSalary = Math.max(
    1,
    Math.floor((horizon.getTime() - now.getTime()) / 86_400_000),
  );

  // Expected salary inflow inside the window.
  const expectedSalaryInflow = sumIncomesInWindow({
    incomes: args.incomes,
    now,
    horizon,
  });

  // Card settlements in window — read from the NEW effective-cash
  // stream so multi-installment plans land on their real debit days.
  const cardImpacts = effectiveCashImpactStream({
    entries: args.entries,
    accounts: args.accounts,
    now,
  });
  let expectedCardSettlements = 0;
  for (const i of cardImpacts) {
    if (i.kind !== "card") continue;
    const t = i.effectiveCashDate.getTime();
    if (t <= now.getTime()) continue;
    if (t > horizon.getTime()) continue;
    expectedCardSettlements += i.amount;
  }

  // Loan installments in window.
  let expectedLoanDebits = 0;
  for (const loan of args.loans) {
    if (!loan.active) continue;
    for (const date of monthlyOccurrences({
      dayOfMonth: loan.dayOfMonth,
      from: now,
      to: horizon,
    })) {
      void date;
      expectedLoanDebits += loan.monthlyInstallment;
    }
  }

  // Recurring rule charges in window.
  let expectedRecurringDebits = 0;
  const paidThisMonth = new Set(
    args.statuses
      .filter(
        (s) =>
          s.status === "paid" &&
          s.monthKey === monthKeyOf(now),
      )
      .map((s) => s.ruleId),
  );
  for (const rule of args.rules) {
    if (!rule.active) continue;
    for (const date of monthlyOccurrences({
      dayOfMonth: rule.dayOfMonth,
      from: now,
      to: horizon,
    })) {
      // Skip a rule that's already been paid this month.
      if (
        monthKeyOf(date) === monthKeyOf(now) &&
        paidThisMonth.has(rule.id)
      ) {
        continue;
      }
      const mk = monthKeyOf(date);
      if (!ruleSchedule(rule, mk).active) continue;
      expectedRecurringDebits += rule.estimatedAmount;
    }
  }

  // Burn-rate cushion = trailing-7-day average × days remaining.
  const dailyBurnAverage = trailingDailyBurn({
    entries: args.entries,
    now,
    windowDays: burnDays,
  });
  const dailyBurnCushion = Math.max(
    0,
    Math.round(dailyBurnAverage * daysUntilNextSalary),
  );

  const safeToSpend =
    currentBalance +
    expectedSalaryInflow -
    expectedCardSettlements -
    expectedLoanDebits -
    expectedRecurringDebits -
    dailyBurnCushion;

  // Vibe — danger when projection ends negative, tight when less
  // than ₪100/day discretionary room, calm otherwise. Threshold is
  // informational only; UI may override by reading raw numbers.
  const TIGHT_FLOOR_PER_DAY = 100;
  const vibe: SafeToSpendVibe =
    safeToSpend < 0
      ? "danger"
      : safeToSpend < daysUntilNextSalary * TIGHT_FLOOR_PER_DAY
        ? "tight"
        : "calm";

  return {
    nextSalaryAtISO: next?.date.toISOString() ?? null,
    daysUntilNextSalary,
    currentBalance: round2(currentBalance),
    expectedSalaryInflow: round2(expectedSalaryInflow),
    expectedCardSettlements: round2(expectedCardSettlements),
    expectedLoanDebits: round2(expectedLoanDebits),
    expectedRecurringDebits: round2(expectedRecurringDebits),
    dailyBurnCushion: round2(dailyBurnCushion),
    dailyBurnAverage: round2(dailyBurnAverage),
    safeToSpend: round2(safeToSpend),
    vibe,
  };
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function sumAnchors(accounts: Account[]): number {
  let s = 0;
  for (const a of accounts) {
    if (!a.active) continue;
    if (a.kind !== "bank") continue;
    if (typeof a.anchorBalance !== "number") continue;
    s += a.anchorBalance;
  }
  return s;
}

type NextSalary = { date: Date; income: Income };

function nextSalaryDate(args: {
  incomes: Income[];
  now: Date;
}): NextSalary | null {
  let best: NextSalary | null = null;
  const now = args.now;
  const monthKey = monthKeyOf(now);
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    const candidates: Date[] = [];
    // Same-month if dayOfMonth still ahead.
    candidates.push(dateOfMonth(monthKey, inc.dayOfMonth));
    candidates.push(dateOfMonth(addMonths(monthKey, 1), inc.dayOfMonth));
    for (const d of candidates) {
      if (d.getTime() <= now.getTime()) continue;
      if (!best || d.getTime() < best.date.getTime()) {
        best = { date: d, income: inc };
        break;
      }
    }
  }
  return best;
}

function dateOfMonth(monthKey: MonthKey, dayOfMonth: number): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // m is 1-based here
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(y, m - 1, day, 12, 0, 0);
}

function endOfNextMonth(now: Date): Date {
  const next = new Date(now);
  next.setMonth(now.getMonth() + 1);
  next.setDate(1);
  next.setHours(12, 0, 0, 0);
  return next;
}

function sumIncomesInWindow(args: {
  incomes: Income[];
  now: Date;
  horizon: Date;
}): number {
  let s = 0;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    for (const date of monthlyOccurrences({
      dayOfMonth: inc.dayOfMonth,
      from: args.now,
      to: args.horizon,
    })) {
      void date;
      s += inc.amount;
    }
  }
  return s;
}

function* monthlyOccurrences(args: {
  dayOfMonth: number;
  from: Date;
  to: Date;
}): Generator<Date> {
  const cursor = new Date(args.from);
  cursor.setHours(0, 0, 0, 0);
  // Look at this month + each subsequent month until past horizon.
  let monthCursor = new Date(args.from.getFullYear(), args.from.getMonth(), 1);
  while (monthCursor.getTime() <= args.to.getTime() + 32 * 86_400_000) {
    const monthKey = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
    const d = dateOfMonth(monthKey, args.dayOfMonth);
    if (d.getTime() > args.from.getTime() && d.getTime() <= args.to.getTime()) {
      yield d;
    }
    monthCursor = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() + 1,
      1,
    );
  }
}

function trailingDailyBurn(args: {
  entries: ExpenseEntry[];
  now: Date;
  windowDays: number;
}): number {
  const cutoff = args.now.getTime() - args.windowDays * 86_400_000;
  const monthKey = monthKeyOf(args.now);
  let total = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    const t = slice.chargeDate.getTime();
    if (t < cutoff) continue;
    if (t > args.now.getTime()) continue;
    total += slice.amount;
  }
  return total / args.windowDays;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
