// Phase 209 — runningBalance(day) simulator.
//
// Walks every day from now → horizon. For each day, applies every
// liquidity event that lands on that day (via effective-cash-date),
// produces a running-balance series. Surfaces:
//
//   * points[]                 day-by-day balance trail
//   * lowestPoint              day + balance at the trough
//   * crossesZero / crossesNegative
//   * nextSalaryAt + balanceAtNextSalary
//   * totalInflow / totalOutflow inside window
//
// Pure compute. Reuses:
//   - buildCashFlowBuckets   for ALL upcoming obligations
//   - existing income.dayOfMonth + amount for salaries
//
// No store, no React. The card UI renders the points as a sparkline.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { effectiveCashImpactStream } from "@/lib/effective-cash-date";
import { incomeForMonth } from "@/lib/income-month";

export type LiquidityEventKind =
  | "income"
  | "card"
  | "loan"
  | "bank_debit";

export type LiquidityEvent = {
  /** ISO of when the cash actually moves in/out of the bank. */
  whenISO: string;
  /** Phase 347 — ISO of the original transaction date. For card
   *  purchases this is the buy date (chargeDate of the entry); for
   *  income / bank-direct-debit / loan / cash it equals `whenISO`.
   *  Optional so legacy test fixtures + callers that never produced
   *  a separate transaction date still typecheck; consumers default
   *  to `whenISO` when unset. */
  transactionISO?: string;
  label: string;
  amount: number; // signed: income > 0, debit < 0
  kind: LiquidityEventKind;
  /** Optional card label so the UI can surface "Visa ****1234". */
  cardLabel?: string;
};

export type LiquidityPoint = {
  /** ISO of midnight at the start of the day. */
  whenISO: string;
  /** Day offset from now (0 = today). */
  dayIndex: number;
  /** Balance at end-of-day after applying every event that fired on
   *  this day. */
  balance: number;
  /** Net signed delta applied on this day. */
  delta: number;
  /** Events that landed on this day. */
  events: LiquidityEvent[];
};

export type LiquidityCurve = {
  points: LiquidityPoint[];
  startingBalance: number;
  lowestPoint: LiquidityPoint;
  highestPoint: LiquidityPoint;
  crossesZero: boolean;
  crossesNegative: boolean;
  /** ISO of next expected salary inside the window, or null. */
  nextSalaryAt: string | null;
  /** Balance at end of next salary's day, or null. */
  balanceAtNextSalary: number | null;
  totalInflow: number;
  totalOutflow: number;
  windowDays: number;
};

const DEFAULT_WINDOW_DAYS = 35;

export function liquidityCurve(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  now?: Date;
  windowDays?: number;
}): LiquidityCurve {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? DEFAULT_WINDOW_DAYS);

  // Phase 405 — adjust the LIVE starting balance for bank impacts
  // that already happened but the user-set anchor predates. A manual
  // withdrawal made today after the anchor was last updated has
  // already moved the bank; LIVE must reflect that immediately
  // without waiting for the user to re-key the anchor.
  const rawAnchors = sumAnchors(args.accounts);
  const maxAnchorAt = args.accounts
    .filter((a) => a.kind === "bank" && a.anchorUpdatedAt)
    .map((a) => new Date(a.anchorUpdatedAt!).getTime())
    .reduce((m, t) => (t > m ? t : m), 0);
  let pastBankDebits = 0;
  for (const impact of effectiveCashImpactStream({
    entries: args.entries,
    accounts: args.accounts,
    rules: args.rules,
    now,
  })) {
    if (impact.kind !== "bank") continue;
    const ts = impact.effectiveCashDate.getTime();
    if (ts > now.getTime()) continue;
    if (maxAnchorAt > 0 && ts <= maxAnchorAt) continue;
    pastBankDebits += impact.amount;
  }
  const startingBalance = rawAnchors - pastBankDebits;

  // 1. Gather every liquidity event in the window.
  const events: LiquidityEvent[] = [];

  // Obligations through cash-flow buckets — single source of truth.
  const buckets = buildCashFlowBuckets({
    accounts: args.accounts,
    loans: args.loans,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays,
  });
  for (const bucket of buckets.buckets) {
    for (const ob of bucket.obligations) {
      events.push({
        whenISO: ob.effectiveCashAt,
        transactionISO: ob.transactionAt ?? ob.effectiveCashAt,
        label: ob.label,
        amount: -ob.amount,
        kind: bucket.source === "card"
          ? "card"
          : bucket.source === "loan"
            ? "loan"
            : "bank_debit",
        cardLabel: bucket.source === "card" ? bucket.label : undefined,
      });
    }
  }

  // Salaries inside the window.
  // Phase 259 — loop until the candidate date passes the horizon so
  // every salary instance that falls inside the curve gets injected.
  // The previous hard-coded `m=0..1` bound silently dropped any
  // salary beyond ~30 days, producing inconsistent month-rollover
  // numbers in the 60-day Hero-Future-Balance lens.
  const horizon = endOfDay(addDays(startOfDay(now), windowDays));
  const maxMonths = Math.ceil(windowDays / 28) + 1;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    for (let m = 0; m <= maxMonths; m++) {
      const date = dateOfDayOfMonth({
        ref: addMonths(now, m),
        dayOfMonth: inc.dayOfMonth,
      });
      if (date.getTime() > horizon.getTime()) break;
      if (date.getTime() > now.getTime()) {
        // Phase 335 — respect per-month actual override. If the
        // user typed "actually got 12,800 this month" the event for
        // that month uses 12,800; events for future months stay on
        // the expected baseline (no override yet).
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthAmount = incomeForMonth(inc, monthKey);
        events.push({
          whenISO: date.toISOString(),
          transactionISO: date.toISOString(),
          label: inc.label,
          amount: monthAmount,
          kind: "income",
        });
      }
    }
  }

  events.sort(
    (a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
  );

  // 2. Walk day-by-day, accumulating balance.
  let balance = startingBalance;
  // Anchor every point at local noon of its day. This keeps
  // `whenISO.startsWith("YYYY-MM-DD")` reliable across UTC+2/+3
  // shifts — otherwise startOfDay (local midnight) would serialize
  // to the previous calendar day in UTC.
  let cursor = noonOfDay(now);
  const points: LiquidityPoint[] = [];

  // Day 0 — today — includes nothing because effective-cash dates
  // are always strictly after `now` in this engine. Still emit so
  // the sparkline anchors at the current balance.
  points.push({
    whenISO: cursor.toISOString(),
    dayIndex: 0,
    balance,
    delta: 0,
    events: [],
  });
  cursor = addDays(cursor, 1);

  // Pre-index events by local-day-of-month-key to avoid O(n*d) scans.
  const eventsByDayKey = new Map<string, LiquidityEvent[]>();
  for (const e of events) {
    const key = dayKey(new Date(e.whenISO));
    const arr = eventsByDayKey.get(key) ?? [];
    arr.push(e);
    eventsByDayKey.set(key, arr);
  }

  for (let i = 1; i <= windowDays; i++) {
    const key = dayKey(cursor);
    const dayEvents = eventsByDayKey.get(key) ?? [];
    const delta = dayEvents.reduce((acc, e) => acc + e.amount, 0);
    balance = round2(balance + delta);
    points.push({
      whenISO: cursor.toISOString(),
      dayIndex: i,
      balance,
      delta: round2(delta),
      events: dayEvents,
    });
    cursor = addDays(cursor, 1);
  }

  // 3. Aggregates.
  let lowest = points[0];
  let highest = points[0];
  let totalInflow = 0;
  let totalOutflow = 0;
  for (const p of points) {
    if (p.balance < lowest.balance) lowest = p;
    if (p.balance > highest.balance) highest = p;
    for (const e of p.events) {
      if (e.amount > 0) totalInflow += e.amount;
      else totalOutflow += -e.amount;
    }
  }
  const crossesZero =
    startingBalance >= 0 && points.some((p) => p.balance < startingBalance && p.balance <= 0);
  const crossesNegative = points.some((p) => p.balance < 0);

  const nextSalary = events.find((e) => e.kind === "income") ?? null;
  let balanceAtNextSalary: number | null = null;
  if (nextSalary) {
    const target = dayKey(new Date(nextSalary.whenISO));
    const point = points.find((p) => dayKey(new Date(p.whenISO)) === target);
    if (point) balanceAtNextSalary = point.balance;
  }

  return {
    points,
    startingBalance: round2(startingBalance),
    lowestPoint: lowest,
    highestPoint: highest,
    crossesZero,
    crossesNegative,
    nextSalaryAt: nextSalary?.whenISO ?? null,
    balanceAtNextSalary,
    totalInflow: round2(totalInflow),
    totalOutflow: round2(totalOutflow),
    windowDays,
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function noonOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function dateOfDayOfMonth(args: { ref: Date; dayOfMonth: number }): Date {
  const ref = args.ref;
  const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, args.dayOfMonth), lastDay);
  return new Date(ref.getFullYear(), ref.getMonth(), day, 12, 0, 0);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
