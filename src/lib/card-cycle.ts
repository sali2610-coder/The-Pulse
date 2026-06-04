// Card billing-cycle projection.
//
// For a card account with `billingDay` (cycle close day) and optional
// `paymentDay` (bank debit day), compute:
//   - Current cycle window  [prevClose+1, thisClose]
//   - Projected close amount  (sum of charge slices landing in the
//     cycle window).
//   - Days remaining until cycle close.
//   - Projected payment debit date (paymentDay of next month).
//
// Pure compute — no mutation. Inputs are Account + ExpenseEntry[].
// Backward-compatible with cards that don't have billingDay set:
// projection returns `undefined`, caller hides the surface.

import type {
  Account,
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { sliceForMonth, daysInMonth as daysInMonthKey } from "@/lib/projections";
import { monthKeyOf, addMonths } from "@/lib/dates";
import { ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";

export type CardCycleProjection = {
  accountId: string;
  cycleStart: Date;
  cycleEnd: Date;
  /** Inclusive `now <= cycleEnd` while the cycle is open. */
  daysUntilClose: number;
  projectedAmount: number;
  entryCount: number;
  /** Bank-debit date (paymentDay of the month following cycleEnd).
   *  Undefined when the card lacks paymentDay. */
  paymentDate?: Date;
};

function clampDayToMonth(day: number, year: number, monthIndex0: number): number {
  const monthKey: MonthKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
  const lastDay = daysInMonthKey(monthKey);
  return Math.min(Math.max(1, day), lastDay);
}

/**
 * Resolve the "current" billing cycle window for a card given `now`.
 * - cycleEnd is the next upcoming billingDay (inclusive). If today is
 *   billingDay itself, cycleEnd is today.
 * - cycleStart is (previous-month billingDay + 1 day).
 *
 * Day-of-month is clamped to the actual month length so a billingDay
 * of 31 in February falls on the last day of February.
 */
export function currentCardCycle(
  account: Account,
  now: Date,
): { cycleStart: Date; cycleEnd: Date } | undefined {
  if (account.kind !== "card") return undefined;
  if (!account.billingDay) return undefined;

  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const todayDay = now.getDate();
  const thisMonthClose = clampDayToMonth(account.billingDay, year, monthIdx);

  // If we're past this month's billing day, the open cycle ended already.
  // The "current" cycle is the one closing next month.
  let endYear = year;
  let endMonthIdx = monthIdx;
  if (todayDay > thisMonthClose) {
    endMonthIdx = monthIdx + 1;
    if (endMonthIdx > 11) {
      endMonthIdx = 0;
      endYear += 1;
    }
  }
  const endDay = clampDayToMonth(account.billingDay, endYear, endMonthIdx);
  const cycleEnd = new Date(endYear, endMonthIdx, endDay, 23, 59, 59, 999);

  // Cycle start = previous-month close + 1 day.
  let prevYear = endYear;
  let prevMonthIdx = endMonthIdx - 1;
  if (prevMonthIdx < 0) {
    prevMonthIdx = 11;
    prevYear -= 1;
  }
  const prevDay = clampDayToMonth(account.billingDay, prevYear, prevMonthIdx);
  const prevClose = new Date(prevYear, prevMonthIdx, prevDay, 23, 59, 59, 999);
  const cycleStart = new Date(prevClose.getTime() + 1000);

  return { cycleStart, cycleEnd };
}

export function projectCardCycle(args: {
  account: Account;
  entries: ExpenseEntry[];
  /** Recurring rules — when provided, linked rules
   *  (`paymentSource === "card"` + `linkedCardId === account.id`)
   *  that fire inside the cycle window contribute to `projectedAmount`.
   *  Paid regular rules are skipped (their matched entry is already
   *  counted); installment rules always contribute since they don't
   *  produce entries automatically. */
  rules?: RecurringRule[];
  statuses?: RecurringStatus[];
  now?: Date;
}): CardCycleProjection | undefined {
  const now = args.now ?? new Date();
  const window = currentCardCycle(args.account, now);
  if (!window) return undefined;

  const { cycleStart, cycleEnd } = window;
  const startMs = cycleStart.getTime();
  const endMs = cycleEnd.getTime();

  // Iterate entries, summing slices whose chargeDate falls within window.
  // Slices may extend across months (installments), so check each month
  // touched by the window.
  let projectedAmount = 0;
  let entryCount = 0;
  const monthsToScan = new Set<MonthKey>();
  monthsToScan.add(monthKeyOf(cycleStart));
  monthsToScan.add(monthKeyOf(cycleEnd));

  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (args.account.id !== e.accountId) continue;
    for (const mk of monthsToScan) {
      const slice = sliceForMonth(e, mk);
      if (!slice) continue;
      const sliceMs = slice.chargeDate.getTime();
      if (sliceMs < startMs || sliceMs > endMs) continue;
      projectedAmount += slice.amount;
      entryCount++;
      break;
    }
  }

  // Linked recurring rules — projected obligations that never produce
  // entries automatically (installments) or that haven't been paid yet
  // this month (regular bills). Without this loop the card cycle
  // projection ignores recurring expenses the user explicitly bound to
  // the card.
  const rules = args.rules ?? [];
  const statuses = args.statuses ?? [];
  for (const rule of rules) {
    if (!rule.active) continue;
    // Phase 354 — recognise both explicit paymentSource="card" AND
    // legacy linkedCardId-only rules.
    if (!isRuleCardSettled(rule)) continue;
    if (rule.linkedCardId !== args.account.id) continue;
    for (const mk of monthsToScan) {
      const sched = ruleSchedule(rule, mk);
      if (!sched.active) continue;
      if (!rule.installmentTotal) {
        const paid = statuses.some(
          (s) =>
            s.ruleId === rule.id &&
            s.monthKey === mk &&
            s.status === "paid",
        );
        if (paid) continue;
      }
      const [yearStr, monthStr] = mk.split("-");
      const year = Number(yearStr);
      const monthIdx0 = Number(monthStr) - 1;
      const day = clampDayToMonth(rule.dayOfMonth, year, monthIdx0);
      const chargeMs = new Date(year, monthIdx0, day, 12, 0, 0).getTime();
      if (chargeMs < startMs || chargeMs > endMs) continue;
      projectedAmount += rule.estimatedAmount;
      entryCount++;
      break;
    }
  }

  const daysUntilClose = Math.max(
    0,
    Math.ceil((endMs - now.getTime()) / 86_400_000),
  );

  let paymentDate: Date | undefined;
  if (args.account.paymentDay) {
    let paymentMonthIdx = cycleEnd.getMonth() + 1;
    let paymentYear = cycleEnd.getFullYear();
    if (paymentMonthIdx > 11) {
      paymentMonthIdx = 0;
      paymentYear += 1;
    }
    const payDay = clampDayToMonth(
      args.account.paymentDay,
      paymentYear,
      paymentMonthIdx,
    );
    paymentDate = new Date(paymentYear, paymentMonthIdx, payDay);
  }

  return {
    accountId: args.account.id,
    cycleStart,
    cycleEnd,
    daysUntilClose,
    projectedAmount,
    entryCount,
    paymentDate,
  };
}

/** Helper for the UI — month-key string for the cycle. */
export function cycleMonthKey(cycle: { cycleEnd: Date }): MonthKey {
  return monthKeyOf(cycle.cycleEnd);
}

// Re-export so the test file gets the named helper without juggling imports.
export { addMonths };
