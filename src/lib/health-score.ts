// Financial health score.
//
// One number 0-100 that summarises the user's current state using the
// signals we already compute everywhere else. The dashboard pin renders the
// number + a verdict; the user gets a single glance answer to "am I doing
// well this month?"
//
// Score is a weighted average of four sub-scores:
//   - Forecast headroom (40%)  — projected EOM vs anchors
//   - Budget discipline (25%)  — projected vs monthlyBudget
//   - Anomaly noise (15%)      — fewer outliers = better
//   - Pace control (20%)       — current burn vs prior-month at same day
//
// Each sub-score is clamped to [0, 100], then averaged. Missing inputs
// (e.g. no bank → no forecast headroom) fall back to neutral 60 to avoid
// punishing a partially-configured user.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { forecastEndOfMonth } from "@/lib/forecast";
import { projectMonth, daysInMonth } from "@/lib/projections";
import { detectAnomalies } from "@/lib/anomalies";
import { addMonths, monthKeyOf } from "@/lib/dates";

export type HealthTone = "great" | "good" | "watch" | "danger";

export type HealthScore = {
  score: number; // 0-100
  tone: HealthTone;
  verdict: string;
  headline: string;
  sub: {
    forecast: number;
    budget: number;
    anomalies: number;
    pace: number;
  };
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function toneOf(score: number): HealthTone {
  if (score >= 80) return "great";
  if (score >= 65) return "good";
  if (score >= 45) return "watch";
  return "danger";
}

function verdictFor(tone: HealthTone): string {
  switch (tone) {
    case "great":
      return "מצב מצוין";
    case "good":
      return "מצב טוב";
    case "watch":
      return "כדאי לעקוב";
    case "danger":
      return "נדרשת תשומת לב";
  }
}

export function buildHealthScore(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
}): HealthScore {
  const now = args.now ?? new Date();

  // 1. Forecast headroom — anchors vs projected EOM.
  let forecastScore = 60;
  const hasBank = args.accounts.some(
    (a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined,
  );
  if (hasBank) {
    const eom = forecastEndOfMonth({
      accounts: args.accounts,
      loans: args.loans,
      incomes: args.incomes,
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey: args.monthKey,
      now,
    });
    if (eom.totalAnchors > 0) {
      // 0 → 50 score; 50% of anchor remaining → 100.
      const ratio = eom.forecast / eom.totalAnchors;
      forecastScore = clamp01(50 + ratio * 100);
    } else {
      // Already negative anchor — heavily penalize.
      forecastScore = eom.forecast >= 0 ? 60 : 20;
    }
  }

  // 2. Budget discipline.
  let budgetScore = 60;
  if (args.monthlyBudget > 0) {
    const proj = projectMonth({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey: args.monthKey,
      now,
    });
    const used = proj.projected / args.monthlyBudget;
    // 1.0 of budget = 50, 0% = 100, 1.5× = 0.
    if (used <= 0) budgetScore = 100;
    else if (used <= 1) budgetScore = clamp01(100 - used * 50);
    else budgetScore = clamp01(50 - (used - 1) * 100);
  }

  // 3. Anomaly noise.
  const anomalies = detectAnomalies({
    entries: args.entries,
    monthKey: args.monthKey,
  });
  const anomalyScore = clamp01(100 - anomalies.length * 12);

  // 4. Pace control.
  let paceScore = 60;
  const isCurrent = monthKeyOf(now) === args.monthKey;
  if (isCurrent) {
    const todayDay = now.getDate();
    const priorKey = addMonths(args.monthKey, -1);
    const priorDays = daysInMonth(priorKey);
    const proj = projectMonth({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey: args.monthKey,
      now,
    });
    const priorProj = projectMonth({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey: priorKey,
      now,
    });
    const priorScale = priorProj.actual * (todayDay / priorDays);
    if (priorScale > 0) {
      const pct = (proj.actual - priorScale) / priorScale;
      // Within ±8% = 100. +20% = 30. +50% = 0.
      const abs = Math.abs(pct);
      if (abs <= 0.08) paceScore = 100;
      else if (abs <= 0.2) paceScore = clamp01(100 - (abs - 0.08) * 500);
      else paceScore = clamp01(40 - (abs - 0.2) * 130);
      // Spending less than prior shouldn't be punished; cap the bonus.
      if (pct < 0) paceScore = Math.max(paceScore, 80);
    }
  }

  const score = Math.round(
    forecastScore * 0.4 +
      budgetScore * 0.25 +
      anomalyScore * 0.15 +
      paceScore * 0.2,
  );
  const tone = toneOf(score);
  const verdict = verdictFor(tone);

  // Build a one-line headline that picks the worst sub-score's culprit.
  const subs: Array<{ key: string; value: number; label: string }> = [
    { key: "forecast", value: forecastScore, label: "צפי סוף חודש" },
    { key: "budget", value: budgetScore, label: "תקציב" },
    { key: "anomalies", value: anomalyScore, label: "חיובים חריגים" },
    { key: "pace", value: paceScore, label: "קצב הוצאות" },
  ];
  subs.sort((a, b) => a.value - b.value);
  const weakest = subs[0];
  const headline =
    score >= 80
      ? "כל הסיגנלים נראים מצוין."
      : `נקודת התורפה: ${weakest.label}.`;

  return {
    score,
    tone,
    verdict,
    headline,
    sub: {
      forecast: Math.round(forecastScore),
      budget: Math.round(budgetScore),
      anomalies: Math.round(anomalyScore),
      pace: Math.round(paceScore),
    },
  };
}
