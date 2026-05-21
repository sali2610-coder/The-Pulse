// Upcoming card bank-debit projections.
//
// Built on top of Phase 90 metadata (billingDay + paymentDay). For
// each active card with both fields, computes the NEXT real debit
// the bank will pull and the amount that debit will settle.
// Surfaces the imminent ones so the user gets a heads-up before
// their checking account drops.
//
// Pure compute — no mutation, no persistence.

import type { Account, ExpenseEntry, MonthKey } from "@/types/finance";
import {
  daysInMonth as daysInMonthKey,
  sliceForMonth,
} from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

export type UpcomingCardDebit = {
  accountId: string;
  cardLabel: string;
  paymentDate: Date;
  daysUntil: number;
  cycleStart: Date;
  cycleEnd: Date;
  projectedAmount: number;
  entryCount: number;
};

function clampDay(day: number, year: number, monthIdx0: number): number {
  const mk: MonthKey = `${year}-${String(monthIdx0 + 1).padStart(2, "0")}`;
  const last = daysInMonthKey(mk);
  return Math.min(Math.max(1, day), last);
}

/** Resolve the next paymentDay occurrence on/after `now`. */
function nextPaymentDate(paymentDay: number, now: Date): Date {
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const todayDay = now.getDate();
  const thisMonthDay = clampDay(paymentDay, year, monthIdx);
  if (todayDay <= thisMonthDay) {
    return new Date(year, monthIdx, thisMonthDay);
  }
  let nextMonthIdx = monthIdx + 1;
  let nextYear = year;
  if (nextMonthIdx > 11) {
    nextMonthIdx = 0;
    nextYear += 1;
  }
  const nextDay = clampDay(paymentDay, nextYear, nextMonthIdx);
  return new Date(nextYear, nextMonthIdx, nextDay);
}

/** Find the cycleEnd that the given paymentDate settles. */
function cycleEndForPayment(
  billingDay: number,
  paymentDate: Date,
): Date {
  const py = paymentDate.getFullYear();
  const pm = paymentDate.getMonth();
  const pd = paymentDate.getDate();
  const sameMonthBilling = clampDay(billingDay, py, pm);
  if (sameMonthBilling < pd) {
    return new Date(py, pm, sameMonthBilling, 23, 59, 59, 999);
  }
  let prevMonthIdx = pm - 1;
  let prevYear = py;
  if (prevMonthIdx < 0) {
    prevMonthIdx = 11;
    prevYear -= 1;
  }
  const prevDay = clampDay(billingDay, prevYear, prevMonthIdx);
  return new Date(prevYear, prevMonthIdx, prevDay, 23, 59, 59, 999);
}

function cycleStartFromEnd(billingDay: number, cycleEnd: Date): Date {
  const ey = cycleEnd.getFullYear();
  const em = cycleEnd.getMonth();
  let prevMonthIdx = em - 1;
  let prevYear = ey;
  if (prevMonthIdx < 0) {
    prevMonthIdx = 11;
    prevYear -= 1;
  }
  const prevDay = clampDay(billingDay, prevYear, prevMonthIdx);
  const prevClose = new Date(
    prevYear,
    prevMonthIdx,
    prevDay,
    23,
    59,
    59,
    999,
  );
  return new Date(prevClose.getTime() + 1000);
}

export function nextCardDebit(args: {
  account: Account;
  entries: ExpenseEntry[];
  now?: Date;
}): UpcomingCardDebit | undefined {
  const now = args.now ?? new Date();
  const { account } = args;
  if (account.kind !== "card") return undefined;
  if (!account.billingDay || !account.paymentDay) return undefined;

  const paymentDate = nextPaymentDate(account.paymentDay, now);
  const cycleEnd = cycleEndForPayment(account.billingDay, paymentDate);
  const cycleStart = cycleStartFromEnd(account.billingDay, cycleEnd);

  const monthsToScan = new Set<MonthKey>();
  monthsToScan.add(monthKeyOf(cycleStart));
  monthsToScan.add(monthKeyOf(cycleEnd));

  let projectedAmount = 0;
  let entryCount = 0;
  const startMs = cycleStart.getTime();
  const endMs = cycleEnd.getTime();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.bankPending) continue;
    if (e.needsConfirmation) continue;
    if (e.excludeFromBudget) continue;
    if (account.id !== e.accountId) continue;
    for (const mk of monthsToScan) {
      const slice = sliceForMonth(e, mk);
      if (!slice) continue;
      const ms = slice.chargeDate.getTime();
      if (ms < startMs || ms > endMs) continue;
      projectedAmount += slice.amount;
      entryCount++;
      break;
    }
  }

  const daysUntil = Math.max(
    0,
    Math.ceil((paymentDate.getTime() - now.getTime()) / 86_400_000),
  );

  return {
    accountId: account.id,
    cardLabel: account.label,
    paymentDate,
    daysUntil,
    cycleStart,
    cycleEnd,
    projectedAmount,
    entryCount,
  };
}

/** All upcoming debits within a horizon (days). Sorted by paymentDate asc. */
export function upcomingCardDebits(args: {
  accounts: Account[];
  entries: ExpenseEntry[];
  now?: Date;
  horizonDays?: number;
}): UpcomingCardDebit[] {
  const horizon = args.horizonDays ?? 7;
  const out: UpcomingCardDebit[] = [];
  for (const a of args.accounts) {
    if (!a.active) continue;
    const debit = nextCardDebit({
      account: a,
      entries: args.entries,
      now: args.now,
    });
    if (!debit) continue;
    if (debit.daysUntil > horizon) continue;
    if (debit.projectedAmount <= 0) continue;
    out.push(debit);
  }
  out.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
  return out;
}
