// Per-card aggregate of monthly financial pressure.
//
// Combines two sources for each active credit-card account:
//
//   1. Recurring rules whose `paymentSource === "card"` and whose
//      `linkedCardId` matches the account id. Includes both regular
//      and installment-plan rules — installments add `ongoingPlans`
//      tally separately from plain recurring monthlies.
//
//   2. ExpenseEntry rows whose `cardLast4` matches the account's
//      `cardLast4`, scoped to the current month via sliceForMonth.
//      Excludes refunds, pending, and excludeFromBudget entries —
//      same filters the snapshot uses.
//
// Pure module. No React, no store. Consumes the same shapes the
// snapshot does so it's safe under the SnapshotProvider.

import type {
  Account,
  ExpenseEntry,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";
import { ruleSchedule } from "@/lib/installment-schedule";

export type CardPressure = {
  card: Account;
  /** Sum of non-installment linked recurring rule estimates that haven't
   *  been paid yet this month. Equals fixedRecurringThisMonth +
   *  variableRecurringThisMonth — kept for back-compat with consumers
   *  that don't care about the fixed/variable split. */
  recurringPendingThisMonth: number;
  /** Non-installment linked recurring rules without `variable: true`
   *  (rent, subscriptions, predictable bills). */
  fixedRecurringThisMonth: number;
  /** Non-installment linked recurring rules flagged `variable: true`
   *  (electricity, water, gas — predictable date, unpredictable amount). */
  variableRecurringThisMonth: number;
  /** Sum of installment-plan linked rules firing this month + remaining
   *  count across all linked plans. */
  installmentThisMonth: number;
  installmentPlansActive: number;
  /** Sum of card-side ExpenseEntry slices that landed (or will land)
   *  this month. */
  entriesThisMonth: number;
  /** Total pressure = sum of all four expense buckets, the user's
   *  "this card costs me X this month" headline. */
  totalThisMonth: number;
  /** When the card carries an explicit creditLimit, the unused frame
   *  after subtracting totalThisMonth. Clamped at zero. Undefined when
   *  no limit is set so the UI can hide the row. */
  remainingFrame: number | undefined;
};

export function buildCardPressure(args: {
  accounts: Account[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: Array<{ ruleId: string; monthKey: MonthKey; status: "paid" | "pending" }>;
  monthKey: MonthKey;
  now?: Date;
}): CardPressure[] {
  const now = args.now ?? new Date();
  const cards = args.accounts.filter(
    (a) => a.kind === "card" && a.active,
  );
  if (cards.length === 0) return [];

  const paidThisMonth = new Set(
    args.statuses
      .filter((s) => s.monthKey === args.monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );

  return cards.map((card) => {
    let fixedRecurringThisMonth = 0;
    let variableRecurringThisMonth = 0;
    let installmentThisMonth = 0;
    let installmentPlansActive = 0;
    let entriesThisMonth = 0;

    // Linked rules.
    for (const rule of args.rules) {
      if (!rule.active) continue;
      if (rule.paymentSource !== "card") continue;
      if (rule.linkedCardId !== card.id) continue;
      const sched = ruleSchedule(rule, args.monthKey);
      if (!sched.active) continue;
      if (rule.installmentTotal) {
        installmentThisMonth += rule.estimatedAmount;
        installmentPlansActive++;
      } else if (!paidThisMonth.has(rule.id)) {
        if (rule.variable) {
          variableRecurringThisMonth += rule.estimatedAmount;
        } else {
          fixedRecurringThisMonth += rule.estimatedAmount;
        }
      }
    }

    // Card-side entries.
    if (card.cardLast4) {
      for (const entry of args.entries) {
        if (entry.cardLast4 !== card.cardLast4) continue;
        if (entry.needsConfirmation) continue;
        if (entry.bankPending) continue;
        if (entry.isRefund) continue;
        if (entry.currency && entry.currency !== "ILS") continue;
        if (entry.excludeFromBudget) continue;
        const slice = sliceForMonth(entry, args.monthKey);
        if (!slice) continue;
        entriesThisMonth += slice.amount;
      }
    }

    const recurringPendingThisMonth =
      fixedRecurringThisMonth + variableRecurringThisMonth;
    const totalThisMonth =
      recurringPendingThisMonth + installmentThisMonth + entriesThisMonth;
    const remainingFrame =
      card.creditLimit !== undefined && card.creditLimit > 0
        ? Math.max(0, card.creditLimit - totalThisMonth)
        : undefined;

    void now;
    return {
      card,
      recurringPendingThisMonth,
      fixedRecurringThisMonth,
      variableRecurringThisMonth,
      installmentThisMonth,
      installmentPlansActive,
      entriesThisMonth,
      totalThisMonth,
      remainingFrame,
    };
  });
}
