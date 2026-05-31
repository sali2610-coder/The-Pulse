// What-if forecast simulator.
//
// Recomputes end-of-month forecast under hypothetical changes the
// user can sketch from the dashboard:
//
//   variableSpendCut    0..1   reduce projected future-card spend
//                              by this fraction (0.2 = "cut 20%
//                              of remaining variable spend")
//   extraIncome         ≥ 0    add a one-time injection landing
//                              in this month
//   extraOutflow        ≥ 0    add a one-time hypothetical outflow
//
// All inputs default to "no change" so a call with `{}` returns
// the unmodified forecast. Pure compute over the same shapes
// forecastEndOfMonth consumes.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { forecastEndOfMonth, type EndOfMonthForecast } from "@/lib/forecast";
import { sliceForMonth } from "@/lib/projections";

export type WhatIfOverrides = {
  variableSpendCut?: number;
  extraIncome?: number;
  extraOutflow?: number;
  /** Phase 275 — multiplier delta applied to expected income.
   *  +0.10 = "salary went up 10%", −0.05 = "5% cut". Combined with
   *  `extraIncome` (one-time bonus). */
  salaryChangePct?: number;
  /** Phase 275 — fraction of recurring fixed obligations the user
   *  would cut (0..1). 0.2 = "trim 20% of pendingFixed". */
  recurringCutPct?: number;
};

export type WhatIfResult = {
  baseline: EndOfMonthForecast;
  simulated: EndOfMonthForecast;
  /** simulated.forecast - baseline.forecast. Positive = saving
   *  improves the bottom line. */
  delta: number;
};

function clampCut(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function nonNegative(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

export function simulateForecast(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
  now?: Date;
  overrides?: WhatIfOverrides;
}): WhatIfResult {
  // Phase 215 — kept on the legacy lens deliberately. what-if is a
  // user-facing simulator; swapping the lens shifts the baseline
  // numbers users have been seeing for months and would invalidate
  // existing "what if I cut 25%" sliders without a UI explainer.
  // Migrate as a separate phase once the simulator gets its own
  // before/after comparison surface.
  const baseline = forecastEndOfMonth({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now: args.now,
  });

  const cut = clampCut(args.overrides?.variableSpendCut ?? 0);
  const extraIncome = nonNegative(args.overrides?.extraIncome ?? 0);
  const extraOutflow = nonNegative(args.overrides?.extraOutflow ?? 0);
  // Phase 275 — salary delta can go negative (cut) and is capped at
  // [-1, +1] to keep the math sane.
  const salaryDeltaRaw = args.overrides?.salaryChangePct ?? 0;
  const salaryDelta = Number.isFinite(salaryDeltaRaw)
    ? Math.max(-1, Math.min(1, salaryDeltaRaw))
    : 0;
  const recurringCut = clampCut(args.overrides?.recurringCutPct ?? 0);

  // No-op fast path.
  if (
    cut === 0 &&
    extraIncome === 0 &&
    extraOutflow === 0 &&
    salaryDelta === 0 &&
    recurringCut === 0
  ) {
    return { baseline, simulated: baseline, delta: 0 };
  }

  // Phase 333 — monthly baselines for the slider math.
  //
  // The baseline values above are "remaining this cycle" — they go to
  // zero once the user is past the dayOfMonth of an income or a rule.
  // That meant the salary / recurring sliders silently no-op'd on the
  // late side of the month, even though the user genuinely wanted to
  // simulate a steady-state monthly change. We now apply each pct to
  // `max(remainingThisCycle, totalActiveMonthly)` so:
  //
  //   - When something hasn't happened yet this cycle, baseline ===
  //     monthly and the math is unchanged (preserves existing tests).
  //   - When the cycle is past, monthly > 0 still drives a real delta.
  const totalMonthlyIncome = args.incomes
    .filter((i) => i.active && i.amount > 0)
    .reduce((s, i) => s + i.amount, 0);
  const totalMonthlyRecurring = args.rules
    .filter((r) => r.active && !r.installmentTotal)
    .reduce((s, r) => s + r.estimatedAmount, 0);
  let totalMonthlyVariable = 0;
  for (const e of args.entries) {
    if (e.needsConfirmation || e.bankPending || e.isRefund) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    totalMonthlyVariable += slice.amount;
  }

  const incomeBase = Math.max(baseline.expectedIncome, totalMonthlyIncome);
  const recurringBase = Math.max(baseline.pendingFixed, totalMonthlyRecurring);
  const variableBase = Math.max(
    baseline.futureCardSlices,
    totalMonthlyVariable,
  );

  // Apply the variable-spend cut against the wider monthly base.
  const trimmedFutureCardSlices = baseline.futureCardSlices * (1 - cut);
  const savedFromCut = variableBase * cut;
  // Phase 275 — recurring cut shrinks pendingFixed.
  const trimmedPendingFixed = baseline.pendingFixed * (1 - recurringCut);
  const savedFromRecurring = recurringBase * recurringCut;
  // Salary multiplier — separate from the one-time injection so the UI
  // can show both levers.
  const salaryAdjusted = baseline.expectedIncome * (1 + salaryDelta);
  const salaryDeltaAbs = incomeBase * salaryDelta;

  const simulated: EndOfMonthForecast = {
    ...baseline,
    expectedIncome: salaryAdjusted + extraIncome,
    pendingFixed: trimmedPendingFixed,
    futureCardSlices: trimmedFutureCardSlices,
    forecast:
      baseline.forecast +
      savedFromCut +
      savedFromRecurring +
      salaryDeltaAbs +
      extraIncome -
      extraOutflow,
    // variance mirrors forecast (current model — see forecast.ts).
    variance:
      baseline.forecast +
      savedFromCut +
      savedFromRecurring +
      salaryDeltaAbs +
      extraIncome -
      extraOutflow,
  };

  return {
    baseline,
    simulated,
    delta: simulated.forecast - baseline.forecast,
  };
}
