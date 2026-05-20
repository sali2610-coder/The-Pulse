// Forward-looking copilot insights.
//
// Produces a short list of proactive narrative observations about the
// user's financial state — the "your financial copilot is watching"
// layer that sits above the raw snapshot numbers.
//
// Pure module, no React, no store. Inputs are exactly the same shapes
// the snapshot already consumes, so adding a new insight = adding one
// detector function here and one tone mapping in the UI. No new
// dashboard widget per insight.
//
// Distinct from the existing `insights.ts` module (Phase 30s) which
// produces backward-looking monthly-digest content. This one is the
// FORWARD-LOOKING, action-oriented layer.

import type {
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { projectMonth, daysInMonth } from "@/lib/projections";
import {
  buildFinancialSnapshot,
  type FinancialSnapshot,
} from "@/lib/financial-snapshot";
import { buildDailyCashflow } from "@/lib/daily-cashflow";

export type InsightSeverity = "info" | "calm" | "watch" | "warn" | "danger";

export type CopilotInsight = {
  /** Stable id so React keys + the "dismiss" path stays predictable. */
  id: string;
  severity: InsightSeverity;
  /** Short headline (one phrase, Hebrew). */
  headline: string;
  /** Optional one-line supporting body. */
  body?: string;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export type CopilotInputs = {
  accounts: Parameters<typeof buildFinancialSnapshot>[0]["accounts"];
  loans: Loan[];
  incomes: Income[];
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: Parameters<typeof buildFinancialSnapshot>[0]["statuses"];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
};

export function buildCopilotInsights(args: CopilotInputs): CopilotInsight[] {
  const now = args.now ?? new Date();
  const snapshot = buildFinancialSnapshot({ ...args, now });
  const out: CopilotInsight[] = [];

  paceVsAverage(out, args, now);
  salaryStabilizes(out, snapshot, args.incomes, now);
  loanShareOfIncome(out, args.loans, args.incomes);
  recurringLoad(out, args.rules, args.incomes);
  upcomingOverdraftDay(out, args, now);

  // Sort by severity, danger first, capped at 3 lines so the card
  // stays scannable.
  const severityRank: Record<InsightSeverity, number> = {
    danger: 0,
    warn: 1,
    watch: 2,
    calm: 3,
    info: 4,
  };
  return out
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 3);
}

// ── Detectors ──────────────────────────────────────────────────────

function paceVsAverage(
  out: CopilotInsight[],
  args: CopilotInputs,
  now: Date,
) {
  const isCurrent = monthKeyOf(now) === args.monthKey;
  if (!isCurrent) return;
  const todayDay = now.getDate();
  if (todayDay < 3) return; // not enough data yet
  const totalDays = daysInMonth(args.monthKey);

  // Pace of THIS month so far, projected to a full-month total.
  const thisMonth = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now,
  });
  const projectedFromPace = (thisMonth.actual / todayDay) * totalDays;

  // 4-month average.
  const priorTotals: number[] = [];
  for (let k = 1; k <= 4; k++) {
    const priorKey = addMonths(args.monthKey, -k);
    const p = projectMonth({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey: priorKey,
      now,
    });
    if (p.actual > 0) priorTotals.push(p.actual);
  }
  if (priorTotals.length === 0) return;
  const avg = priorTotals.reduce((a, b) => a + b, 0) / priorTotals.length;
  if (avg <= 0) return;

  const pct = Math.round(((projectedFromPace - avg) / avg) * 100);
  if (pct >= 15) {
    out.push({
      id: "pace-above",
      severity: pct >= 30 ? "warn" : "watch",
      headline: `קצב ההוצאות החודש גבוה ב-${pct}% מהממוצע האחרון.`,
      body: `במידה והקצב יישמר, סוף החודש צפוי לעלות ב-${ILS.format(
        Math.round(projectedFromPace - avg),
      )} מעבר לרגיל.`,
    });
  } else if (pct <= -15) {
    out.push({
      id: "pace-below",
      severity: "calm",
      headline: `קצב ההוצאות החודש נמוך ב-${Math.abs(pct)}% מהממוצע.`,
      body: "התזמון הזה מתפנה למרווח גמיש יותר עד סוף החודש.",
    });
  }
}

function salaryStabilizes(
  out: CopilotInsight[],
  snapshot: FinancialSnapshot,
  incomes: Income[],
  now: Date,
) {
  if (snapshot.expectedOverdraft <= 0) return;
  if (snapshot.expectedIncomeUntilNextMonth < snapshot.expectedOverdraft) {
    return;
  }
  const todayDay = now.getDate();
  const next = incomes
    .filter((i) => i.active && i.dayOfMonth >= todayDay)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0];
  if (!next) return;
  out.push({
    id: "salary-stabilizes",
    severity: "watch",
    headline: `המשכורת ביום ${next.dayOfMonth} צפויה להוציא אותך מהמינוס.`,
    body: `נכנסים ${ILS.format(
      next.amount,
    )} שמכסים את החריגה הצפויה (${ILS.format(snapshot.expectedOverdraft)}).`,
  });
}

function loanShareOfIncome(
  out: CopilotInsight[],
  loans: Loan[],
  incomes: Income[],
) {
  const totalIncome = incomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.amount, 0);
  if (totalIncome <= 0) return;
  const totalLoans = loans
    .filter((l) => l.active)
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);
  if (totalLoans <= 0) return;
  const pct = Math.round((totalLoans / totalIncome) * 100);
  if (pct < 15) return;
  out.push({
    id: "loan-share",
    severity: pct >= 35 ? "warn" : "watch",
    headline: `תשלומי הלוואות צורכים ${pct}% מהמשכורת החודשית.`,
    body: `סך התשלומים החודשיים: ${ILS.format(totalLoans)} מתוך ${ILS.format(
      totalIncome,
    )}.`,
  });
}

function recurringLoad(
  out: CopilotInsight[],
  rules: RecurringRule[],
  incomes: Income[],
) {
  const totalIncome = incomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.amount, 0);
  if (totalIncome <= 0) return;
  const totalRecurring = rules
    .filter((r) => r.active && !r.installmentTotal)
    .reduce((sum, r) => sum + r.estimatedAmount, 0);
  if (totalRecurring <= 0) return;
  const pct = Math.round((totalRecurring / totalIncome) * 100);
  if (pct < 25) return;
  out.push({
    id: "recurring-load",
    severity: pct >= 50 ? "warn" : "watch",
    headline: `הוצאות קבועות תופסות ${pct}% מהמשכורת.`,
    body: `${ILS.format(totalRecurring)} מתוך ${ILS.format(
      totalIncome,
    )} מנותב כל חודש לחיובים קבועים.`,
  });
}

function upcomingOverdraftDay(
  out: CopilotInsight[],
  args: CopilotInputs,
  now: Date,
) {
  const cf = buildDailyCashflow({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now,
  });
  const todayDay = now.getDate();
  const futureDip = cf.days.find(
    (d) => d.day >= todayDay && d.runningBalance < 0,
  );
  if (!futureDip) return;
  const daysAhead = futureDip.day - todayDay;
  if (daysAhead === 0) return;
  out.push({
    id: "future-overdraft",
    severity: daysAhead <= 4 ? "danger" : "warn",
    headline: `חיוב צפוי להיכנס למינוס תוך ${daysAhead} ימים.`,
    body: `ב-${futureDip.day} בחודש היתרה הצפויה תרד ל-${ILS.format(
      futureDip.runningBalance,
    )}.`,
  });
}
