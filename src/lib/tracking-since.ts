// "Tracking with Sally for X" — anniversary helper.
//
// Reads the earliest createdAt across every persisted entity
// (entries, rules, loans, accounts, incomes) and reports how long
// the user has been tracking. Pure compute over store inputs.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

export type TrackingSince = {
  /** ISO timestamp of the earliest createdAt across every entity. */
  startedAt: string;
  /** Days elapsed from startedAt to now. */
  totalDays: number;
  /** Floor(totalDays / 30) — convenient months-tracked surface. */
  months: number;
};

function parseTs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function computeTrackingSince(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  loans: Loan[];
  accounts: Account[];
  incomes: Income[];
  now?: Date;
}): TrackingSince | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const list of [
    args.entries,
    args.rules,
    args.loans,
    args.accounts,
    args.incomes,
  ]) {
    for (const item of list as Array<{ createdAt?: string }>) {
      const ts = parseTs(item.createdAt);
      if (ts !== null && ts < earliest) earliest = ts;
    }
  }
  if (earliest === Number.POSITIVE_INFINITY) return null;
  const now = (args.now ?? new Date()).getTime();
  const totalDays = Math.max(0, Math.floor((now - earliest) / 86_400_000));
  return {
    startedAt: new Date(earliest).toISOString(),
    totalDays,
    months: Math.floor(totalDays / 30),
  };
}
