// Cashflow runway + stress scenarios.
//
// Different from EmergencyFundCard (which compares liquid to a
// fixed-month target). Runway asks: at the current burn rate,
// HOW MANY months does the current liquid last? Plus stress
// variants:
//   "lose primary income"   → drops the largest active income
//                            from the inflow side and recomputes
//   "outflow shock"         → multiplies baseline outflow by a
//                            configurable factor (default 1.5)
//   "no income"             → income = 0
//
// Pure compute. Reuses safeToSpend-style baseline math but
// expressed as months-of-runway instead of total ILS.

import type {
  Account,
  ExpenseEntry,
  Income,
  MonthKey,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";

export type RunwayScenario = {
  id: string;
  label: string;
  monthsOfRunway: number; // Infinity when outflow ≤ inflow
  monthlyNet: number; // inflow − outflow (signed; positive = saving)
  monthlyInflow: number;
  monthlyOutflow: number;
};

export type RunwayReport = {
  liquid: number;
  baseline: RunwayScenario;
  scenarios: RunwayScenario[];
};

function monthOutflow(args: {
  entries: ExpenseEntry[];
  monthKey: MonthKey;
}): number {
  let s = 0;
  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    s += slice.amount;
  }
  return s;
}

function liquidOf(accounts: Account[]): number {
  let s = 0;
  for (const a of accounts) {
    if (!a.active) continue;
    if (a.kind !== "bank") continue;
    const bal = a.anchorBalance ?? 0;
    if (bal > 0) s += bal;
  }
  return s;
}

function totalIncome(incomes: Income[]): number {
  let s = 0;
  for (const i of incomes) if (i.active) s += i.amount;
  return s;
}

function largestIncome(incomes: Income[]): number {
  let max = 0;
  for (const i of incomes) {
    if (!i.active) continue;
    if (i.amount > max) max = i.amount;
  }
  return max;
}

function makeScenario(args: {
  id: string;
  label: string;
  liquid: number;
  monthlyInflow: number;
  monthlyOutflow: number;
}): RunwayScenario {
  const net = args.monthlyInflow - args.monthlyOutflow;
  let monthsOfRunway: number;
  if (args.monthlyOutflow === 0) {
    monthsOfRunway = Number.POSITIVE_INFINITY;
  } else if (net >= 0) {
    // Cash-flow positive — runway is unbounded.
    monthsOfRunway = Number.POSITIVE_INFINITY;
  } else {
    const drain = -net; // positive
    monthsOfRunway = args.liquid / drain;
  }
  return {
    id: args.id,
    label: args.label,
    monthsOfRunway,
    monthlyNet: net,
    monthlyInflow: args.monthlyInflow,
    monthlyOutflow: args.monthlyOutflow,
  };
}

export function runwayReport(args: {
  accounts: Account[];
  incomes: Income[];
  entries: ExpenseEntry[];
  /** Months to average baseline outflow over. Default 3. */
  lookback?: number;
  /** Multiplier for the "outflow shock" scenario. Default 1.5. */
  shockMultiplier?: number;
  now?: Date;
}): RunwayReport {
  const now = args.now ?? new Date();
  const lookback = Math.max(1, args.lookback ?? 3);
  const shock = Math.max(1, args.shockMultiplier ?? 1.5);

  const liquid = liquidOf(args.accounts);
  const incomeNow = totalIncome(args.incomes);

  // Baseline outflow = average over prior `lookback` COMPLETED
  // months — excludes the in-flight current month.
  const currentMonth = monthKeyOf(now);
  let outflowSum = 0;
  for (let i = 1; i <= lookback; i++) {
    outflowSum += monthOutflow({
      entries: args.entries,
      monthKey: addMonths(currentMonth, -i),
    });
  }
  const baselineOutflow = outflowSum / lookback;

  const baseline = makeScenario({
    id: "baseline",
    label: "מצב נוכחי",
    liquid,
    monthlyInflow: incomeNow,
    monthlyOutflow: baselineOutflow,
  });

  const lostPrimary = makeScenario({
    id: "lost_primary",
    label: "אובדן הכנסה ראשית",
    liquid,
    monthlyInflow: Math.max(0, incomeNow - largestIncome(args.incomes)),
    monthlyOutflow: baselineOutflow,
  });

  const noIncome = makeScenario({
    id: "no_income",
    label: "ללא הכנסה",
    liquid,
    monthlyInflow: 0,
    monthlyOutflow: baselineOutflow,
  });

  const shockScenario = makeScenario({
    id: "outflow_shock",
    label: `הוצאות ×${shock}`,
    liquid,
    monthlyInflow: incomeNow,
    monthlyOutflow: baselineOutflow * shock,
  });

  return {
    liquid,
    baseline,
    scenarios: [lostPrimary, noIncome, shockScenario],
  };
}
