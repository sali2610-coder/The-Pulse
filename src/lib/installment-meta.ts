// Phase 269 — derive installment progress metadata for a single
// item row. Lets the UI render "תשלום 3 מתוך 12" + monthly /
// original totals without each component repeating the lookup
// logic.
//
// Pure compute. No store access — caller supplies entries + rules.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { ruleSchedule } from "@/lib/installment-schedule";

export type InstallmentMeta = {
  /** 1-based number of the installment that fires in `monthKey`. */
  current: number;
  /** Total installments in the plan. */
  total: number;
  /** Installments still due AFTER this one. */
  remaining: number;
  /** Monthly amount (single slice). */
  monthly: number;
  /** Sum of every slice across the plan. */
  originalTotal: number;
};

/** Look up installment progress for a card-hierarchy item row.
 *  Returns null when the item isn't part of an installment plan
 *  (one-shot card entry, simple recurring rule). */
export function installmentMetaForRefId(args: {
  refId: string;
  monthKey: MonthKey;
  entries: ExpenseEntry[];
  rules: RecurringRule[];
}): InstallmentMeta | null {
  if (args.refId.startsWith("entry:")) {
    // Phase 420 — single canonical decoder. Engine emits refIds as
    // `entry:<id>` (no slice index segment); the index is derived
    // here from the LIVE entry.chargeDate vs args.monthKey delta so
    // any Settings edit to chargeDate / installments propagates to
    // Credit Cards immediately. No cached snapshot.
    const parts = args.refId.split(":");
    const entryId = parts[1];
    if (!entryId) return null;
    const entry = args.entries.find((e) => e.id === entryId);
    if (!entry) return null;
    if (!(entry.installments > 1)) return null;
    const total = entry.installments;
    const chargeMonth = entry.chargeDate.slice(0, 7);
    const [cy, cm] = chargeMonth.split("-").map(Number);
    const [my, mm] = args.monthKey.split("-").map(Number);
    if (!cy || !cm || !my || !mm) return null;
    const sliceIndex = (my - cy) * 12 + (mm - cm);
    if (sliceIndex < 0 || sliceIndex >= total) return null;
    const current = sliceIndex + 1;
    const monthly = entry.amount / total;
    return {
      current,
      total,
      remaining: Math.max(0, total - current),
      monthly,
      originalTotal: entry.amount,
    };
  }
  if (args.refId.startsWith("rule:")) {
    const ruleId = args.refId.slice("rule:".length);
    const rule = args.rules.find((r) => r.id === ruleId);
    if (!rule) return null;
    if (!rule.installmentTotal || rule.installmentTotal <= 1) return null;
    const schedule = ruleSchedule(rule, args.monthKey);
    if (!schedule.active || schedule.paymentNumber === undefined) return null;
    return {
      current: schedule.paymentNumber,
      total: rule.installmentTotal,
      remaining: schedule.remaining ?? Math.max(0, rule.installmentTotal - schedule.paymentNumber),
      monthly: rule.estimatedAmount,
      originalTotal: rule.estimatedAmount * rule.installmentTotal,
    };
  }
  return null;
}

/** Variant for category-spend's source/id shape:
 *    { source: "entry" | "rule", id: string } */
export function installmentMetaForSource(args: {
  source: "entry" | "rule";
  id: string;
  monthKey: MonthKey;
  entries: ExpenseEntry[];
  rules: RecurringRule[];
}): InstallmentMeta | null {
  if (args.source === "entry") {
    const entry = args.entries.find((e) => e.id === args.id);
    if (!entry) return null;
    if (!(entry.installments > 1)) return null;
    const total = entry.installments;
    // For category-spend rows we don't have a slice index — assume
    // the current month's slice is the chargeDate month + offset.
    const chargeMonth = entry.chargeDate.slice(0, 7);
    const [cy, cm] = chargeMonth.split("-").map(Number);
    const [my, mm] = args.monthKey.split("-").map(Number);
    const sliceIndex = (my - cy) * 12 + (mm - cm);
    if (sliceIndex < 0 || sliceIndex >= total) return null;
    return {
      current: sliceIndex + 1,
      total,
      remaining: Math.max(0, total - (sliceIndex + 1)),
      monthly: entry.amount / total,
      originalTotal: entry.amount,
    };
  }
  // Rule
  const rule = args.rules.find((r) => r.id === args.id);
  if (!rule) return null;
  if (!rule.installmentTotal || rule.installmentTotal <= 1) return null;
  const schedule = ruleSchedule(rule, args.monthKey);
  if (!schedule.active || schedule.paymentNumber === undefined) return null;
  return {
    current: schedule.paymentNumber,
    total: rule.installmentTotal,
    remaining:
      schedule.remaining ??
      Math.max(0, rule.installmentTotal - schedule.paymentNumber),
    monthly: rule.estimatedAmount,
    originalTotal: rule.estimatedAmount * rule.installmentTotal,
  };
}
