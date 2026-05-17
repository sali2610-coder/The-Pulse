import type {
  ExpenseEntry,
  PaymentMethod,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { ruleSchedule } from "@/lib/installment-schedule";
import { monthKeyOf, monthIndex, dayWithinMonth } from "@/lib/dates";
import type { MonthKey } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";

type Projection = {
  actual: number;
  projected: number;
  upcoming: number;
};

export function sliceAmount(entry: ExpenseEntry): number {
  if (entry.installments <= 1) return entry.amount;
  return entry.amount / entry.installments;
}

export type InstallmentProgress = {
  /** Total number of installments scheduled (entry.installments). */
  total: number;
  /** Slices already charged (offset+1 of slices whose chargeDate <= now). */
  paid: number;
  /** Slices yet to charge. */
  remaining: number;
  /** Sum already charged. */
  paidAmount: number;
  /** Sum still to charge. */
  remainingAmount: number;
  /** Slice index (1-based) that will charge next, or undefined when done. */
  nextIndex?: number;
  /** Charge date of the next pending slice, undefined when complete. */
  nextChargeDate?: Date;
  /** True when total installments have all been paid. */
  isComplete: boolean;
};

/**
 * Compute installment lifecycle state for a single entry. Treats single-charge
 * entries (installments === 1) as either paid (chargeDate <= now) or pending.
 */
export function installmentProgress(
  entry: ExpenseEntry,
  now: Date = new Date(),
): InstallmentProgress {
  const total = Math.max(1, Math.floor(entry.installments));
  const start = new Date(entry.chargeDate);
  const startIdx = monthIndex(monthKeyOf(start));
  const slice = total > 1 ? entry.amount / total : entry.amount;

  // How many slices have a chargeDate strictly on/before today?
  let paid = 0;
  for (let i = 0; i < total; i++) {
    const targetIdx = startIdx + i;
    // Compute charge day for this offset month.
    const targetY = Math.floor(targetIdx / 12);
    const targetM0 = targetIdx % 12;
    const lastDay = new Date(targetY, targetM0 + 1, 0).getDate();
    const day = Math.min(start.getDate(), lastDay);
    const chargeDate = new Date(targetY, targetM0, day);
    if (chargeDate.getTime() <= now.getTime()) {
      paid++;
    } else {
      break;
    }
  }

  const remaining = Math.max(0, total - paid);
  const paidAmount = paid * slice;
  const remainingAmount = remaining * slice;
  const isComplete = paid >= total;

  let nextIndex: number | undefined;
  let nextChargeDate: Date | undefined;
  if (!isComplete) {
    nextIndex = paid + 1;
    const targetIdx = startIdx + paid;
    const targetY = Math.floor(targetIdx / 12);
    const targetM0 = targetIdx % 12;
    const lastDay = new Date(targetY, targetM0 + 1, 0).getDate();
    const day = Math.min(start.getDate(), lastDay);
    nextChargeDate = new Date(targetY, targetM0, day);
  }

  return {
    total,
    paid,
    remaining,
    paidAmount,
    remainingAmount,
    nextIndex,
    nextChargeDate,
    isComplete,
  };
}

export function sliceForMonth(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): { amount: number; chargeDate: Date } | null {
  const start = new Date(entry.chargeDate);
  const startIdx = monthIndex(monthKeyOf(start));
  const targetIdx = monthIndex(monthKey);
  const offset = targetIdx - startIdx;
  if (offset < 0 || offset >= entry.installments) return null;

  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(start.getDate(), lastDay);
  const chargeDate = new Date(y, m - 1, day);

  return { amount: sliceAmount(entry), chargeDate };
}

function statusKey(ruleId: string, monthKey: MonthKey) {
  return `${ruleId}__${monthKey}`;
}

export function buildStatusMap(
  statuses: RecurringStatus[],
): Map<string, RecurringStatus> {
  const map = new Map<string, RecurringStatus>();
  for (const s of statuses) map.set(statusKey(s.ruleId, s.monthKey), s);
  return map;
}

export function getRuleStatus(
  statuses: RecurringStatus[],
  ruleId: string,
  monthKey: MonthKey,
): RecurringStatus | undefined {
  return buildStatusMap(statuses).get(statusKey(ruleId, monthKey));
}

export function projectMonth(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  now?: Date;
}): Projection {
  const now = args.now ?? new Date();
  let actual = 0;
  let upcoming = 0;

  for (const entry of args.entries) {
    // Wallet partials the user hasn't reviewed don't count toward either
    // bucket — they would double-count once SMS arrives and we merge.
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() <= now.getTime()) {
      actual += slice.amount;
    } else {
      upcoming += slice.amount;
    }
  }

  const statusMap = buildStatusMap(args.statuses);
  for (const rule of args.rules) {
    if (!rule.active) continue;
    const status = statusMap.get(statusKey(rule.id, args.monthKey));
    if (status?.status === "paid") continue;
    if (!ruleSchedule(rule, args.monthKey).active) continue;
    upcoming += rule.estimatedAmount;
  }

  return { actual, projected: actual + upcoming, upcoming };
}

export function actualUntilDay(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  day: number;
}): number {
  let total = 0;
  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getDate() <= args.day) {
      total += slice.amount;
    }
  }
  return total;
}

export function actualByPaymentMethod(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  now?: Date;
}): Record<PaymentMethod, number> {
  const now = args.now ?? new Date();
  const totals: Record<PaymentMethod, number> = { cash: 0, credit: 0 };
  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() > now.getTime()) continue;
    totals[entry.paymentMethod] += slice.amount;
  }
  return totals;
}

export function categoryTotals(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
  now?: Date;
}): Map<CategoryId, number> {
  const now = args.now ?? new Date();
  const map = new Map<CategoryId, number>();
  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() > now.getTime()) continue;
    map.set(entry.category, (map.get(entry.category) ?? 0) + slice.amount);
  }
  return map;
}

export function daysInMonth(monthKey: MonthKey): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function pendingRulesForMonth(args: {
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): Array<{
  rule: RecurringRule;
  status: RecurringStatus | undefined;
  expectedDate: Date;
}> {
  const map = buildStatusMap(args.statuses);
  return args.rules
    .filter((r) => r.active && ruleSchedule(r, args.monthKey).active)
    .map((rule) => ({
      rule,
      status: map.get(statusKey(rule.id, args.monthKey)),
      expectedDate: dayWithinMonth(args.monthKey, rule.dayOfMonth),
    }))
    .sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime());
}
