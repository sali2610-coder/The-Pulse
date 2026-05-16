// Monthly digest insights.
//
// Pulls every detector + projection in the app into a single ordered list of
// narrative insights for the dashboard "summary" card. Each insight is a
// short Hebrew headline + a number + a tone (positive / neutral / warning /
// danger). Pure function — no React, no store coupling — so tests can pin
// every edge case.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

import {
  forecastBalanceChain,
  forecastEndOfMonth,
  futureMonthlyPressure,
} from "@/lib/forecast";
import { projectMonth, daysInMonth } from "@/lib/projections";
import { detectAnomalies } from "@/lib/anomalies";
import { detectSubscriptionCandidates } from "@/lib/subscriptions";
import { addMonths, monthKeyOf } from "@/lib/dates";

export type InsightTone = "positive" | "neutral" | "warning" | "danger";

export type Insight = {
  /** Stable id used for React `key` + a11y. */
  id: string;
  tone: InsightTone;
  /** Short Hebrew label (e.g. "חיובים חריגים"). */
  label: string;
  /** Headline body (e.g. "4 חיובים מעל הרגיל", "+₪1,200 צפי"). */
  headline: string;
  /** Optional one-line supporting detail. */
  detail?: string;
  /** When non-zero, used by the UI as the headline number. */
  value?: number;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_FMT = new Intl.DateTimeFormat("he-IL", { month: "long" });

function monthKeyToDate(monthKey: MonthKey): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function buildMonthlyDigest(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
}): Insight[] {
  const now = args.now ?? new Date();
  const out: Insight[] = [];

  const hasBank = args.accounts.some(
    (a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined,
  );

  // 1. End-of-month forecast — only when a bank anchor exists.
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
    const tone: InsightTone = eom.forecast < 0 ? "danger" : "positive";
    out.push({
      id: "eom",
      tone,
      label: "צפי סוף חודש",
      headline: ILS.format(eom.forecast),
      detail:
        eom.forecast < 0
          ? "סיום חודש בחריגה — שקול לדחות הוצאות."
          : "סיום חודש בעודף.",
      value: eom.forecast,
    });
  }

  // 2. Spending pace vs last month at same day.
  const proj = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
    now,
  });
  const priorKey = addMonths(args.monthKey, -1);
  const priorProj = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey: priorKey,
    now,
  });
  // To compare fairly, take prior-month total restricted to "current day".
  // Use daysInMonth to cap, then a simple linear comparison.
  const isCurrent = monthKeyOf(now) === args.monthKey;
  if (isCurrent) {
    const todayDay = now.getDate();
    const priorDays = daysInMonth(priorKey);
    const priorScale = priorProj.actual * (todayDay / priorDays);
    const delta = proj.actual - priorScale;
    if (priorScale > 0) {
      const pct = (delta / priorScale) * 100;
      const tone: InsightTone =
        Math.abs(pct) < 8 ? "neutral" : pct > 0 ? "warning" : "positive";
      const sign = delta >= 0 ? "+" : "−";
      out.push({
        id: "pace",
        tone,
        label: "קצב לעומת חודש קודם",
        headline: `${sign}${Math.abs(Math.round(pct))}%`,
        detail:
          delta >= 0
            ? `הוצאת ${ILS.format(Math.abs(delta))} יותר עד היום.`
            : `חסכת ${ILS.format(Math.abs(delta))} עד היום.`,
        value: pct,
      });
    }
  }

  // 3. Budget headroom — only when monthlyBudget > 0.
  if (args.monthlyBudget > 0) {
    const headroom = args.monthlyBudget - proj.projected;
    const tone: InsightTone =
      headroom < 0 ? "danger" : headroom < args.monthlyBudget * 0.15 ? "warning" : "positive";
    out.push({
      id: "budget",
      tone,
      label: "תקציב",
      headline:
        headroom < 0
          ? `חריגה ${ILS.format(Math.abs(headroom))}`
          : `נותר ${ILS.format(headroom)}`,
      detail:
        headroom < 0
          ? "הצפי כבר עובר את היעד."
          : `מתוך ${ILS.format(args.monthlyBudget)}.`,
      value: headroom,
    });
  }

  // 4. First overdraft month within the 6-month horizon.
  if (hasBank) {
    const chain = forecastBalanceChain({
      accounts: args.accounts,
      loans: args.loans,
      incomes: args.incomes,
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      fromMonthKey: args.monthKey,
      months: 6,
      now,
    });
    const firstNegative = chain.find((c) => c.goesNegative);
    if (firstNegative) {
      out.push({
        id: "overdraft",
        tone: "danger",
        label: "אופק חריגה",
        headline: `חריגה ב־${MONTH_FMT.format(monthKeyToDate(firstNegative.monthKey))}`,
        detail: `לפי הצפי הנוכחי, יום ${firstNegative.overdraftDay ?? "?"}.`,
      });
    }
  }

  // 5. Anomalies this month.
  const anomalies = detectAnomalies({
    entries: args.entries,
    monthKey: args.monthKey,
  });
  if (anomalies.length > 0) {
    const worst = anomalies[0];
    out.push({
      id: "anomalies",
      tone: "warning",
      label: "חיובים חריגים",
      headline: `${anomalies.length} מעל הרגיל`,
      detail: `${worst.merchant} ${worst.factor.toFixed(1)}× מעל ממוצע.`,
      value: anomalies.length,
    });
  }

  // 6. Subscription radar candidates.
  const subs = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  });
  if (subs.length > 0) {
    out.push({
      id: "subs",
      tone: "neutral",
      label: "מנויים חדשים",
      headline: `${subs.length} זוהו`,
      detail: `${subs[0].merchant} ${ILS.format(subs[0].estimatedAmount)} / חודש.`,
      value: subs.length,
    });
  }

  // 7. Next-month commitment wall.
  const pressure = futureMonthlyPressure({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    loans: args.loans,
    monthKey: args.monthKey,
    months: 2,
    now,
  });
  if (pressure.length > 1 && pressure[1].total > 0) {
    out.push({
      id: "pressure",
      tone: "neutral",
      label: "לחץ חודש הבא",
      headline: ILS.format(pressure[1].total),
      detail: `${pressure[1].activeInstallmentEntries} תשלומים פעילים + קבועות.`,
      value: pressure[1].total,
    });
  }

  // Sort by tone severity so the most actionable insights surface first.
  const toneRank: Record<InsightTone, number> = {
    danger: 0,
    warning: 1,
    positive: 2,
    neutral: 3,
  };
  out.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);

  // Avoid surfacing the "balance forecast" timeline insight stand-alone —
  // hide it if `proj.actual` is zero so a fresh user with no data sees a
  // clean empty card (the consumer can also gate on `out.length`).
  if (
    proj.actual === 0 &&
    !hasBank &&
    args.monthlyBudget <= 0 &&
    out.length === 0
  ) {
    return out;
  }

  return out;
}

