// Spending-recommendation engine.
//
// Synthesizes the existing financial signals (forecast, daily
// allowance, category pace, card pressure, fixed commitments) into a
// short list of Hebrew-language, action-oriented recommendations the
// dashboard can surface. Each rule is gated so a quiet user state
// produces an empty list — the UI auto-hides when none fire.
//
// Pure compute. Reuses the canonical financial engine — no parallel
// math, no re-derivation of slices.

import type { ExpenseEntry, MonthKey, RecurringRule, RecurringStatus, Account } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { getCategory } from "@/lib/categories";
import { monthKeyOf } from "@/lib/dates";
import { projectMonth, daysInMonth } from "@/lib/projections";
import { dailyAllowance, forecastMonthEnd } from "@/lib/forecast";
import { categoryPace } from "@/lib/category-pace";
import { buildCardPressure } from "@/lib/card-pressure";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export type RecommendationSeverity = "info" | "watch" | "warn";

export type SpendingRecommendation = {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  /** Suggested daily-spend ceiling or other numeric anchor when
   *  applicable. Lets the UI render a mono chip alongside the text. */
  anchor?: { label: string; value: string };
};

export type SpendingRecommendationsInput = {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  monthlyBudget: number;
  monthKey?: MonthKey;
  now?: Date;
};

export function spendingRecommendations(
  args: SpendingRecommendationsInput,
): SpendingRecommendation[] {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const out: SpendingRecommendation[] = [];

  const proj = projectMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey,
    now,
  });
  const totalDays = daysInMonth(monthKey);
  const today = now.getDate();
  const daysRemaining = Math.max(1, totalDays - today + 1);

  // 1. Budget-vs-pace. Emit ONE tip — either "safe pace" or one of
  //    "high pace" / "over budget".
  if (args.monthlyBudget > 0) {
    const ratio = proj.projected / args.monthlyBudget;
    if (ratio >= 1) {
      const overBy = Math.round(proj.projected - args.monthlyBudget);
      out.push({
        id: "over_budget",
        severity: "warn",
        title: "חורגים מהתקציב החודשי",
        detail: `הקצב הצפוי מעבר לתקציב ב־${ILS.format(overBy)}. נסה לעצור הוצאות שאינן הכרחיות עד סוף החודש.`,
        anchor: { label: "חריגה", value: ILS.format(overBy) },
      });
    } else if (ratio >= 0.85) {
      const allow = dailyAllowance({
        entries: args.entries,
        rules: args.rules,
        statuses: args.statuses,
        monthlyBudget: args.monthlyBudget,
        monthKey,
        now,
      });
      out.push({
        id: "high_pace",
        severity: "watch",
        title: "קצב הוצאות גבוה",
        detail: `נצלת ${Math.round(ratio * 100)}% מהתקציב. כדי לסגור את החודש בסדר, השתדל להישאר תחת ${ILS.format(allow.allowance)} ליום עד הסוף.`,
        anchor: {
          label: "מותר ליום",
          value: ILS.format(allow.allowance),
        },
      });
    } else if (ratio <= 0.6 && today >= 15) {
      out.push({
        id: "safe_pace",
        severity: "info",
        title: "קצב הוצאות בטוח",
        detail: `אתה בקצב נמוך מהתקציב (${Math.round(ratio * 100)}%). אפשר להגדיל חיסכון או לנשום רגע.`,
      });
    }
  }

  // 2. Category drift. Surface UP TO TWO categories whose projected
  //    EOM is materially higher than their 3-month median.
  const pace = categoryPace({
    entries: args.entries,
    monthKey,
    now,
    lookback: 3,
  });
  const drifting = pace
    .filter((p) => p.priorMedian > 0 && p.deltaVsPrior / p.priorMedian >= 0.25)
    .slice(0, 2);
  for (const row of drifting) {
    const meta = getCategory(row.category as CategoryId);
    out.push({
      id: `category_drift:${row.category}`,
      severity: "watch",
      title: `${meta.label} עולה מהרגיל`,
      detail: `בקצב הנוכחי קטגוריית ${meta.label} תסיים החודש סביב ${ILS.format(Math.round(row.projectedEOM))}, גבוה ב־${ILS.format(Math.round(row.deltaVsPrior))} מהממוצע של 3 החודשים האחרונים.`,
      anchor: {
        label: "צפוי",
        value: ILS.format(Math.round(row.projectedEOM)),
      },
    });
  }

  // 3. Card pressure. Cards with creditLimit AND ratio >= 0.75 → one
  //    tip per card, capped at the worst three so the list stays calm.
  const pressures = buildCardPressure({
    accounts: args.accounts,
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey,
    now,
  });
  const tightCards = pressures
    .filter((p) => p.card.creditLimit && p.card.creditLimit > 0)
    .map((p) => ({
      ...p,
      ratio: p.totalThisMonth / (p.card.creditLimit ?? 1),
    }))
    .filter((p) => p.ratio >= 0.75)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  for (const p of tightCards) {
    out.push({
      id: `card_pressure:${p.card.id}`,
      severity: p.ratio >= 1 ? "warn" : "watch",
      title: `עומס גבוה על ${p.card.label}`,
      detail: `נצלת ${Math.round(p.ratio * 100)}% ממסגרת הכרטיס החודש. שקול להסיט חיוב גדול לכרטיס אחר.`,
      anchor: { label: "ניצול", value: `${Math.round(p.ratio * 100)}%` },
    });
  }

  // 4. Fixed-commitment headroom. When the user has a budget AND
  //    pending fixed obligations swallow most of what's left.
  if (args.monthlyBudget > 0) {
    const eom = forecastMonthEnd({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthlyBudget: args.monthlyBudget,
      monthKey,
      now,
    });
    void eom;
    const remainingBudget = args.monthlyBudget - proj.actual;
    const freeAfterCommitments = remainingBudget - proj.upcoming;
    if (
      freeAfterCommitments >= 0 &&
      freeAfterCommitments < args.monthlyBudget * 0.1 &&
      daysRemaining >= 7
    ) {
      out.push({
        id: "fixed_squeeze",
        severity: "watch",
        title: "התחייבויות קבועות אוכלות את שארית התקציב",
        detail: `אחרי ההוצאות הקבועות שעדיין צפויות החודש, נשארו רק ${ILS.format(Math.max(0, Math.round(freeAfterCommitments)))} זמינים ל־${daysRemaining} ימים הקרובים.`,
        anchor: {
          label: "פנוי",
          value: ILS.format(Math.max(0, Math.round(freeAfterCommitments))),
        },
      });
    }
  }

  return out;
}
