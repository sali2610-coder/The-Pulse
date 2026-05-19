// Central cash-flow engine.
//
// One function, one shape, one truth. Every dashboard widget that used to
// run its own forecast math now reads from this snapshot. Eliminates the
// drift between CFO Summary / BalanceForecast / HealthScore / Pulse — they
// all answer the SAME question with the SAME numbers.
//
// Question this snapshot answers:
//   "Where will my balance land on the 1st of next month after every
//    income, every obligation, and my own discretionary budget?"

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

import { sliceForMonth } from "@/lib/projections";
import { monthKeyOf, addMonths } from "@/lib/dates";
import { loanSchedule, ruleSchedule } from "@/lib/installment-schedule";

export type RiskLevel = "safe" | "watch" | "tight" | "overdraft";

export type FinancialSnapshot = {
  /** ISO date the snapshot was generated. */
  generatedAt: string;
  /** `YYYY-MM` of the month being projected. */
  monthKey: MonthKey;
  /** Day-of-month at the moment the snapshot was generated. 1..31. */
  today: number;
  /** Days remaining in the month (inclusive of today). */
  daysRemainingInMonth: number;

  // ─── Balance sheet input ───────────────────────────────────────────
  /** Σ active bank-account anchorBalance values (may be negative). */
  currentBalance: number;

  // ─── Cash IN, future (until 1st of next month) ─────────────────────
  /** Salaries / incomes whose `dayOfMonth >= today` and that are active. */
  expectedIncomeUntilNextMonth: number;

  // ─── Cash OUT, future (until 1st of next month) ────────────────────
  /** Recurring non-installment rules still pending this month. */
  fixedExpensesUntilNextMonth: number;
  /** Recurring installment-plan rules (TV in 12 payments) firing this month. */
  installmentPaymentsUntilNextMonth: number;
  /** Loan monthly installments still pending. */
  activeLoansPaymentsUntilNextMonth: number;
  /** Future credit-card slices from `entries` (already charged ignored). */
  recurringCommitmentsUntilNextMonth: number;

  // ─── Discretionary budget ──────────────────────────────────────────
  /** Σ entry slices already charged this month (cash + credit). */
  actualSpentThisMonth: number;
  /** User's configured monthly spending budget (0 = no budget set). */
  monthlyBudget: number;
  /** budget − actualSpentThisMonth (clamped >=0). 0 if no budget. */
  remainingBudgetThisMonth: number;
  /**
   * Projected remaining discretionary spend the user is likely to make
   * before month end. Defaults to the unused portion of monthlyBudget,
   * unless actualSpent already exceeded budget — then 0.
   */
  remainingPlannedSpending: number;

  // ─── Bottom line ───────────────────────────────────────────────────
  /**
   * Balance the user will hold on day 1 of next month, AFTER all the
   * future inflows, future obligations, and remaining discretionary
   * budget have all played out.
   *
   *   = currentBalance
   *   + expectedIncomeUntilNextMonth
   *   − fixedExpensesUntilNextMonth
   *   − installmentPaymentsUntilNextMonth
   *   − activeLoansPaymentsUntilNextMonth
   *   − recurringCommitmentsUntilNextMonth
   *   − remainingPlannedSpending
   */
  projectedBalanceOnFirstOfNextMonth: number;
  /**
   * Same as above but excluding the discretionary `remainingPlannedSpending`
   * — i.e. what's left if the user spends nothing more from their budget.
   * Used by "safe to spend" cards.
   */
  projectedBalanceWithoutDiscretionary: number;
  /** projectedBalance < 0 → Math.abs(projectedBalance), else 0. */
  expectedOverdraft: number;
  /**
   * Σ user can still discretionarily spend without going overdraft.
   *   = max(0, projectedBalanceWithoutDiscretionary)
   * If currentBalance is already negative, drops to 0.
   */
  safeToSpendUntilMonthEnd: number;
  /** safeToSpend / daysRemaining (rounded down). */
  dailySafeToSpend: number;

  /** Stoplight color for the dashboard hero. */
  riskLevel: RiskLevel;
};

function daysInMonth(monthKey: MonthKey): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function classifyRisk(args: {
  projectedBalance: number;
  currentBalance: number;
}): RiskLevel {
  if (args.projectedBalance < 0) return "overdraft";
  if (args.currentBalance < 0) return "tight";
  if (args.currentBalance <= 0) {
    return args.projectedBalance < 1000 ? "tight" : "safe";
  }
  const ratio = args.projectedBalance / args.currentBalance;
  if (ratio < 0.05) return "tight";
  if (ratio < 0.25) return "watch";
  return "safe";
}

export function buildFinancialSnapshot(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  /** Override "now" for tests. Defaults to `new Date()`. */
  now?: Date;
  /** Override the projected month. Defaults to the month of `now`. */
  monthKey?: MonthKey;
}): FinancialSnapshot {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const totalDays = daysInMonth(monthKey);
  const isCurrentMonth = monthKeyOf(now) === monthKey;
  const today = isCurrentMonth ? Math.min(now.getDate(), totalDays) : 1;
  const daysRemaining = Math.max(1, totalDays - today + 1);

  // Σ active bank anchors. Cards (kind === "card") are excluded — only
  // bank accounts carry a "current balance" the user can spend from.
  const currentBalance = args.accounts
    .filter(
      (a) =>
        a.active && a.kind === "bank" && a.anchorBalance !== undefined,
    )
    .reduce((sum, a) => sum + (a.anchorBalance ?? 0), 0);

  // Expected income: pay-days still ahead this month.
  const expectedIncomeUntilNextMonth = args.incomes
    .filter((i) => i.active && (!isCurrentMonth || i.dayOfMonth >= today))
    .reduce((sum, i) => sum + i.amount, 0);

  // Pending recurring rules — split into "fixed monthly" vs "installment".
  const paidThisMonth = new Set(
    args.statuses
      .filter((s) => s.monthKey === monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );
  let fixedExpensesUntilNextMonth = 0;
  let installmentPaymentsUntilNextMonth = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (paidThisMonth.has(rule.id)) continue;
    if (!ruleSchedule(rule, monthKey).active) continue;
    if (isCurrentMonth && rule.dayOfMonth < today) continue;
    if (rule.installmentTotal) {
      installmentPaymentsUntilNextMonth += rule.estimatedAmount;
    } else {
      fixedExpensesUntilNextMonth += rule.estimatedAmount;
    }
  }

  // Active loan installments still pending this month.
  let activeLoansPaymentsUntilNextMonth = 0;
  for (const loan of args.loans) {
    if (!loanSchedule(loan, monthKey).active) continue;
    if (isCurrentMonth && loan.dayOfMonth < today) continue;
    activeLoansPaymentsUntilNextMonth += loan.monthlyInstallment;
  }

  // Future credit-card slices already locked in (BNPL plans on the card).
  let recurringCommitmentsUntilNextMonth = 0;
  let actualSpentThisMonth = 0;
  for (const entry of args.entries) {
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    if (entry.isRefund) continue;
    if (entry.excludeFromBudget) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    const slice = sliceForMonth(entry, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() <= now.getTime()) {
      actualSpentThisMonth += slice.amount;
    } else {
      recurringCommitmentsUntilNextMonth += slice.amount;
    }
  }

  const monthlyBudget = Math.max(0, args.monthlyBudget);
  const remainingBudgetThisMonth = Math.max(
    0,
    monthlyBudget - actualSpentThisMonth,
  );
  const remainingPlannedSpending = monthlyBudget > 0
    ? remainingBudgetThisMonth
    : 0;

  const projectedBalanceWithoutDiscretionary =
    currentBalance
    + expectedIncomeUntilNextMonth
    - fixedExpensesUntilNextMonth
    - installmentPaymentsUntilNextMonth
    - activeLoansPaymentsUntilNextMonth
    - recurringCommitmentsUntilNextMonth;

  const projectedBalanceOnFirstOfNextMonth =
    projectedBalanceWithoutDiscretionary - remainingPlannedSpending;

  const expectedOverdraft =
    projectedBalanceOnFirstOfNextMonth < 0
      ? Math.abs(projectedBalanceOnFirstOfNextMonth)
      : 0;

  const safeToSpendUntilMonthEnd =
    currentBalance < 0
      ? 0
      : Math.max(0, projectedBalanceWithoutDiscretionary);
  const dailySafeToSpend =
    safeToSpendUntilMonthEnd > 0
      ? Math.floor(safeToSpendUntilMonthEnd / daysRemaining)
      : 0;

  const riskLevel = classifyRisk({
    projectedBalance: projectedBalanceOnFirstOfNextMonth,
    currentBalance,
  });

  // Touch addMonths so the bundler tree-shakes the import alongside the
  // other date helpers this module depends on transitively.
  void addMonths;

  return {
    generatedAt: now.toISOString(),
    monthKey,
    today,
    daysRemainingInMonth: daysRemaining,
    currentBalance,
    expectedIncomeUntilNextMonth,
    fixedExpensesUntilNextMonth,
    installmentPaymentsUntilNextMonth,
    activeLoansPaymentsUntilNextMonth,
    recurringCommitmentsUntilNextMonth,
    actualSpentThisMonth,
    monthlyBudget,
    remainingBudgetThisMonth,
    remainingPlannedSpending,
    projectedBalanceOnFirstOfNextMonth,
    projectedBalanceWithoutDiscretionary,
    expectedOverdraft,
    safeToSpendUntilMonthEnd,
    dailySafeToSpend,
    riskLevel,
  };
}
