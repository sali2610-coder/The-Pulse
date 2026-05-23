// "כמה הוצאתי החודש?" — single authoritative answer.
//
// Sum of actual outflow slices charged this month, with the same
// noise filters every other engine uses:
//   - skip refunds (positive flow, not spend)
//   - skip needsConfirmation / bankPending (not finalized)
//   - skip excludeFromBudget
//   - skip FX rows (currency tracked separately)
//
// IMPORTANT: this is independent of bank-account anchors. Anchors
// are CURRENT-BALANCE snapshots and already include past charges
// implicitly. Surfacing them here would double-count spend.
//
// Pure compute. Returns the same shape downstream consumers expect
// from projectMonth().actual but with a dedicated, documented API
// so the dashboard "הוצאתי החודש" card can render it directly.

import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type MonthlySpent = {
  monthKey: MonthKey;
  /** Total outflow already charged this month (sum of slice amounts
   *  whose chargeDate <= now). */
  spentSoFar: number;
  /** Number of contributing entry slices. */
  charges: number;
  /** Refund credit observed this month (positive number). Separate
   *  from spentSoFar so the UI can show both lines. */
  refundCredit: number;
};

export function monthlySpent(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): MonthlySpent {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  let spent = 0;
  let charges = 0;
  let refunds = 0;
  const nowMs = now.getTime();
  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() > nowMs) continue;
    if (e.isRefund) {
      refunds += slice.amount;
    } else {
      spent += slice.amount;
      charges += 1;
    }
  }
  return {
    monthKey,
    spentSoFar: round2(spent),
    charges,
    refundCredit: round2(refunds),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
