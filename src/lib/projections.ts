import type {
  ExpenseEntry,
  PaymentMethod,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
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
    .filter((r) => r.active)
    .map((rule) => ({
      rule,
      status: map.get(statusKey(rule.id, args.monthKey)),
      expectedDate: dayWithinMonth(args.monthKey, rule.dayOfMonth),
    }))
    .sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime());
}
