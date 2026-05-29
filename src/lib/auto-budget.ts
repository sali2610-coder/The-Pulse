// Phase 210 — Auto budget engine.
//
// Single source for "how much can I safely spend until end of cycle"
// when the user picks `budgetMode === "auto"`. Wraps the existing
// Phase 207-208 liquidity engine so no math is re-derived here.
//
// Cycle end definition:
//   * If a salary is scheduled in the next 35 days → cycle ends the
//     day BEFORE that salary (we want the answer "until the next
//     salary tops up the account").
//   * Otherwise → end of next month.
//
// Output:
//   * spendableUntilCycleEnd     ILS the user can spend total
//   * dailyAllowance             spendable / daysRemaining
//   * vibe                       calm | tight | danger
//   * cycleEndAt                 ISO of cycle horizon
//   * recommendedMonthlyBudget   anchored to actuals + safe future
//                                spend. Used to seed the PulseBar
//                                marker when budgetMode === "auto"
//                                and the user hasn't set monthlyBudget.
//
// Per-card grouping is preserved — we read from buildCashFlowBuckets
// so a card-linked rule never double-counts.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { monthlySpent } from "@/lib/monthly-spent";
import { daysInMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";
import {
  buildBudgetControlBreakdown,
  type BudgetControlBreakdown,
} from "@/lib/budget-control";

export type AutoBudgetVibe = "calm" | "tight" | "danger";

export type AutoBudgetReport = {
  cycleEndAt: string;
  daysRemaining: number;
  /** Total ILS safe to spend from today through cycle end. */
  spendableUntilCycleEnd: number;
  dailyAllowance: number;
  vibe: AutoBudgetVibe;
  /** Lowest projected balance during the window. */
  lowestProjectedBalance: number;
  /** Whether projection ever goes negative — drives the danger
   *  banner. */
  willCrossZero: boolean;
  /** Single recommended monthly budget the dashboard can use to
   *  back the PulseBar marker when running in auto mode. Computed
   *  as actualSpentThisMonth + spendableUntilCycleEnd. */
  recommendedMonthlyBudget: number;
  /** Echo of the user's preference so explain sheets can show it. */
  safetyBufferApplied: number;
  /** Phase 322 — full decomposition that drove `spendableUntilCycleEnd`.
   *  UI surfaces it so the headline number is auditable. The raw
   *  `available` here may be negative; consumers should fall through
   *  to `breakdown.available < 0` for the danger banner. */
  breakdown: BudgetControlBreakdown;
  /** Phase 322 — `breakdown.available` echoed at the top level so
   *  callers don't have to drill in for the most-asked number. May be
   *  negative. */
  availableUntilCycleEnd: number;
};

const TIGHT_FLOOR_PER_DAY = 100;

export function autoBudget(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  safetyBuffer?: number;
  now?: Date;
}): AutoBudgetReport {
  const now = args.now ?? new Date();
  const safetyBuffer = Math.max(0, args.safetyBuffer ?? 0);

  // Walk the curve forward 35 days. Pick cycleEnd = day BEFORE the
  // next salary (we want runway until salary tops up), falling back
  // to the curve horizon.
  const curve = liquidityCurve({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays: 35,
  });

  const cycleEnd = pickCycleEnd({
    points: curve.points,
    salaryIso: curve.nextSalaryAt,
  });
  const cycleEndIdx = cycleEnd.dayIndex;
  // From today INCLUSIVE up to (and including) cycleEnd.
  const daysRemaining = Math.max(1, cycleEndIdx);

  // Lowest balance between now and cycle end (NOT past it — we don't
  // want a post-salary spike to mask a mid-cycle dip).
  let lowest = curve.points[0]?.balance ?? 0;
  for (let i = 1; i <= cycleEndIdx; i++) {
    if (curve.points[i].balance < lowest) lowest = curve.points[i].balance;
  }

  // Phase 322 — full breakdown. The headline `spendable` clamps at
  // zero (the user can't spend negative ILS), but downstream surfaces
  // read `breakdown.available` directly to render the negative number
  // and the warning banner.
  const breakdown = buildBudgetControlBreakdown({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    safetyBuffer,
    now,
  });
  const spendable = Math.max(0, breakdown.available);
  const dailyAllowance = round2(spendable / daysRemaining);
  void lowest;

  // Vibe: same threshold logic as safe-to-spend for parity.
  let vibe: AutoBudgetVibe = "calm";
  if (breakdown.available < 0) {
    vibe = "danger";
  } else if (dailyAllowance < TIGHT_FLOOR_PER_DAY) {
    vibe = "tight";
  }

  // Recommended monthly budget for the PulseBar marker. Sum:
  //   actualSpentThisMonth + spendable. PulseBar reads it as the
  //   month-cap so the visible bar stays calibrated.
  const monthKey = monthKeyOf(now);
  const spent = monthlySpent({
    entries: args.entries,
    monthKey,
    now,
  });
  // Pro-rate spendable to a notional month so PulseBar's scale
  // doesn't shrink dramatically when the cycle window is short.
  // Phase 322 — when `breakdown.available` is negative there is no
  // safe spend; collapse the recommendation to 0 instead of echoing
  // back `spent.spentSoFar`, which used to look like a positive
  // budget on the surface.
  const monthDays = daysInMonth(monthKey);
  const proRatedSpendable =
    daysRemaining > 0 ? (spendable * monthDays) / daysRemaining : spendable;
  const recommendedMonthlyBudget =
    breakdown.available < 0
      ? 0
      : round2(Math.max(0, spent.spentSoFar + proRatedSpendable));

  return {
    cycleEndAt: cycleEnd.whenISO,
    daysRemaining,
    spendableUntilCycleEnd: round2(spendable),
    dailyAllowance,
    vibe,
    lowestProjectedBalance: round2(lowest),
    willCrossZero: curve.crossesNegative,
    recommendedMonthlyBudget,
    safetyBufferApplied: round2(safetyBuffer),
    breakdown,
    availableUntilCycleEnd: breakdown.available,
  };
}

/** Returns the monthlyBudget the dashboard should use given the
 *  user's preference. Manual mode → user's typed value. Auto mode →
 *  the engine's recommendation. Phase 322: once the engine produces a
 *  report we trust it, even when its recommendation is 0 (budget
 *  exhausted). Falling back to a stale manual value here was the
 *  source of the "₪7,393" mis-display when the user was already in
 *  the minus. The only time we fall through to manual is when the
 *  engine couldn't compute at all (no anchors). */
export function effectiveMonthlyBudget(args: {
  monthlyBudget: number;
  budgetMode: "manual" | "auto";
  autoReport: AutoBudgetReport | null;
}): number {
  if (args.budgetMode === "manual") return args.monthlyBudget;
  if (!args.autoReport) return args.monthlyBudget;
  if (!args.autoReport.breakdown.hasAnchors) return args.monthlyBudget;
  return args.autoReport.recommendedMonthlyBudget;
}

function pickCycleEnd(args: {
  points: { whenISO: string; dayIndex: number; balance: number }[];
  salaryIso: string | null;
}): { whenISO: string; dayIndex: number } {
  // No salary scheduled → use the curve horizon.
  if (!args.salaryIso) {
    const last = args.points[args.points.length - 1];
    return { whenISO: last.whenISO, dayIndex: last.dayIndex };
  }
  const target = args.salaryIso.slice(0, 10);
  for (let i = 0; i < args.points.length; i++) {
    if (args.points[i].whenISO.startsWith(target)) {
      // Day BEFORE salary → use index-1, clamped to >= 1 so we never
      // return today itself (no runway window).
      const idx = Math.max(1, i - 1);
      return { whenISO: args.points[idx].whenISO, dayIndex: idx };
    }
  }
  const last = args.points[args.points.length - 1];
  return { whenISO: last.whenISO, dayIndex: last.dayIndex };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
