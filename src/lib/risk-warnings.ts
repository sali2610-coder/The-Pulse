// Forward-looking risk warnings.
//
// Phase 4.3 — aggregates the signals scattered across forecast,
// obligations, card-pressure, and stale-anchor detectors into a
// single ranked list so the user sees the upcoming risks in one
// surface instead of reading 6 cards.
//
// Pure compute. Each warning is independently testable. The
// consumer (RiskWarningsCard) renders them in severity order; the
// module itself doesn't decide UI tone — only sets the `severity`.

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
import { buildCardPressure } from "@/lib/card-pressure";
import { safeToSpend } from "@/lib/obligations";
import { monthKeyOf } from "@/lib/dates";

export type RiskSeverity = "info" | "watch" | "warn" | "alert";

export type RiskWarning = {
  id: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  /** Optional signed amount the warning is about, for the UI to
   *  render in ILS. */
  amount?: number;
};

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  alert: 0,
  warn: 1,
  watch: 2,
  info: 3,
};

export type RiskInputs = {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  monthKey?: MonthKey;
  now?: Date;
  /** Days after which a bank anchor balance is considered stale. */
  staleAnchorDays?: number;
};

const STALE_DEFAULT_DAYS = 14;

function totalIncome(args: { incomes: Income[] }): number {
  let s = 0;
  for (const i of args.incomes) if (i.active) s += i.amount;
  return s;
}

/** Returns the ranked list of warnings — most severe first. Empty
 *  list = nothing to flag. */
export function buildRiskWarnings(args: RiskInputs): RiskWarning[] {
  const now = args.now ?? new Date();
  const monthKey = args.monthKey ?? monthKeyOf(now);
  const out: RiskWarning[] = [];

  // 1. Forecast end-of-month < 0 → alert.
  // Phase 215 — opt into the effective-cash lens so the warning
  // threshold reflects the real cash-hit dates per card.
  const forecast = forecastEndOfMonth({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey,
    now,
    useEffectiveCashDates: true,
  });
  if (forecast.forecast < 0) {
    out.push({
      id: "forecast_negative",
      severity: "alert",
      title: "החודש יסתיים בחריגה",
      detail: "תזרים סוף-חודש שלילי לפי האנקרים, ההכנסות וההתחייבויות הצפויות.",
      amount: forecast.forecast,
    });
  }

  // 2. Budget consumption — flagged when monthlyBudget is set and
  //    realized-spend already meets or exceeds it. Softer signal
  //    than `forecast_negative`; only fires when the forecast is
  //    still nominally positive.
  if (args.monthlyBudget > 0 && forecast.forecast >= 0) {
    let spentSoFar = 0;
    for (const entry of args.entries) {
      if (entry.isRefund) continue;
      if (entry.excludeFromBudget) continue;
      if (entry.currency && entry.currency !== "ILS") continue;
      // Best-effort: count entries whose chargeDate is in the current
      // month and on/before now. We don't double-count installment
      // slices here because realized-budget cares about the original
      // charge moment, not the slice schedule.
      const charged = new Date(entry.chargeDate);
      if (!Number.isFinite(charged.getTime())) continue;
      if (monthKeyOf(charged) !== monthKey) continue;
      if (charged.getTime() > now.getTime()) continue;
      spentSoFar += entry.amount;
    }
    if (spentSoFar >= args.monthlyBudget) {
      out.push({
        id: "budget_consumed",
        severity: "warn",
        title: "התקציב החודשי כבר נצרך",
        detail:
          "מעבר לסכום שהגדרת לחודש — שווה לבדוק אם להגדיל תקציב או לצמצם הוצאות.",
        amount: args.monthlyBudget - spentSoFar,
      });
    }
  }
  // Keep safeToSpend imported for type symmetry — its detailed
  // numbers are surfaced elsewhere on the dashboard.
  void safeToSpend;

  // 3. Single card pressure > 50% of monthly income.
  const income = totalIncome(args);
  if (income > 0) {
    const pressures = buildCardPressure({
      accounts: args.accounts,
      rules: args.rules,
      entries: args.entries,
      statuses: args.statuses,
      monthKey,
      now,
    });
    for (const p of pressures) {
      const ratio = p.totalThisMonth / income;
      if (ratio >= 0.5) {
        out.push({
          id: `card_high_pressure:${p.card.id}`,
          severity: ratio >= 0.8 ? "alert" : "warn",
          title: `${p.card.label}: ${Math.round(ratio * 100)}% מההכנסה`,
          detail: "לחץ גבוה של חיובי כרטיס מול ההכנסה החודשית הצפויה.",
          amount: p.totalThisMonth,
        });
      }
    }
  }

  // 4. Fixed-cost ratio (income vs all committed monthly outflows) ≥ 70%.
  const committed =
    forecast.pendingFixed + forecast.pendingLoans + forecast.futureCardSlices;
  if (income > 0) {
    const ratio = committed / income;
    if (ratio >= 0.7) {
      out.push({
        id: "fixed_cost_ratio_high",
        severity: ratio >= 0.9 ? "alert" : "warn",
        title: `${Math.round(ratio * 100)}% מההכנסה מחויבת מראש`,
        detail: "התחייבויות חודשיות תופסות נתח גבוה מההכנסה — כל הוצאה לא צפויה מסיטה מאוזן.",
        amount: committed,
      });
    } else if (ratio >= 0.55) {
      out.push({
        id: "fixed_cost_ratio_watch",
        severity: "watch",
        title: `${Math.round(ratio * 100)}% מההכנסה מחויבת מראש`,
        detail: "בטווח הבריא הגבוה — לעקוב אחרי גידול בקבועים.",
        amount: committed,
      });
    }
  }

  // 5. Stale anchor — bank balance not refreshed in N days.
  const staleDays = args.staleAnchorDays ?? STALE_DEFAULT_DAYS;
  const staleMs = staleDays * 86_400_000;
  for (const acc of args.accounts) {
    if (!acc.active) continue;
    if (acc.kind !== "bank") continue;
    if (acc.anchorBalance === undefined) continue;
    if (!acc.anchorUpdatedAt) continue;
    const updated = new Date(acc.anchorUpdatedAt).getTime();
    if (!Number.isFinite(updated)) continue;
    const age = now.getTime() - updated;
    if (age <= staleMs) continue;
    out.push({
      id: `stale_anchor:${acc.id}`,
      severity: "watch",
      title: `יתרת ${acc.label} לא רוענה מזה ${Math.floor(age / 86_400_000)} ימים`,
      detail: "התחזית מסתמכת על האנקר — רענון מדויק שומר על איכות החיזוי.",
    });
  }

  // Sort by severity (most severe first); preserve insertion order
  // for ties so per-card ordering stays predictable.
  out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return out;
}
