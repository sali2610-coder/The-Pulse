// Phase 335 — single source of truth for "how much income for month M".
//
// Income carries two parallel amounts since Phase 316:
//
//   amount          — immutable expected baseline (the income's
//                     monthly definition).
//   actualByMonth   — per-month overrides the user types in via
//                     IncomeBreakdownCard's editor sheet.
//
// Phase 316 only wired the override into the card display; every
// downstream engine (financial-snapshot, liquidity-curve,
// budget-control, income-breakdown, auto-budget) kept reading the
// raw `amount`, so a user who said "actually I only got 12,800 in
// May" still saw 13,000 everywhere else and on June 1 the May
// override appeared to vanish — the Pulse / Budget / EOM forecast
// all reverted to the 13,000 baseline.
//
// `incomeForMonth(inc, monthKey)` is the single reader every
// engine should use. Pure compute; no side effects.

import type { Income, MonthKey } from "@/types/finance";

export function incomeForMonth(inc: Income, monthKey: MonthKey): number {
  const override = inc.actualByMonth?.[monthKey];
  if (
    typeof override === "number" &&
    Number.isFinite(override) &&
    override >= 0
  ) {
    return override;
  }
  return inc.amount;
}

/** Sum every active income for `monthKey`, respecting per-month
 *  actuals. Engines that fold all incomes into one number should
 *  call this instead of `incomes.reduce((s, i) => s + i.amount, 0)`. */
export function totalIncomeForMonth(
  incomes: Income[],
  monthKey: MonthKey,
): number {
  let sum = 0;
  for (const inc of incomes) {
    if (!inc.active) continue;
    const v = incomeForMonth(inc, monthKey);
    if (v > 0) sum += v;
  }
  return sum;
}
