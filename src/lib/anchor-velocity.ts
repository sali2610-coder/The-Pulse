// Anchor burn velocity per bank.
//
// For each active bank account, derive:
//   weeklySpend     average rate of entries that landed against
//                   THIS bank (via accountId) over the last 28
//                   days
//   daysToZero      anchorBalance ÷ dailySpend (or Infinity when
//                   no spend has hit this bank)
//   trend           "drain" if spend > 0, else "stable"
//
// Pure compute. Reuses entry slices so an installment paying
// this card across months only contributes its slice amount.
// Banks without an anchorBalance set return null (the dashboard
// already nudges the user to set one elsewhere).

import type {
  Account,
  ExpenseEntry,
} from "@/types/finance";

export type BankVelocity = {
  accountId: string;
  label: string;
  anchorBalance: number;
  weeklySpend: number;
  dailySpend: number;
  daysToZero: number; // Infinity when spend is 0
  trend: "drain" | "stable";
};

export function bankVelocities(args: {
  accounts: Account[];
  entries: ExpenseEntry[];
  /** Window in days to average over. Default 28. */
  windowDays?: number;
  now?: Date;
}): BankVelocity[] {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 28);
  const windowMs = windowDays * 86_400_000;
  const startMs = now.getTime() - windowMs;
  const endMs = now.getTime();

  const banks = args.accounts.filter(
    (a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined,
  );
  if (banks.length === 0) return [];

  const totals = new Map<string, number>();
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    if (!e.accountId) continue;
    const t = new Date(e.chargeDate).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < startMs || t > endMs) continue;
    totals.set(e.accountId, (totals.get(e.accountId) ?? 0) + e.amount);
  }

  return banks.map((b): BankVelocity => {
    const spent = totals.get(b.id) ?? 0;
    const dailySpend = spent / windowDays;
    const weeklySpend = dailySpend * 7;
    const anchor = b.anchorBalance ?? 0;
    let daysToZero: number;
    if (dailySpend <= 0) {
      daysToZero = Number.POSITIVE_INFINITY;
    } else if (anchor <= 0) {
      daysToZero = 0;
    } else {
      daysToZero = anchor / dailySpend;
    }
    return {
      accountId: b.id,
      label: b.label,
      anchorBalance: anchor,
      weeklySpend,
      dailySpend,
      daysToZero,
      trend: dailySpend > 0 ? "drain" : "stable",
    };
  });
}
