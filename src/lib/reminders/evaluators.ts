// Pure evaluators that walk the store snapshot and emit the list of
// reminders that would fire right now. No I/O, no scheduling — those
// belong to a future dispatcher. Keeping the rules pure makes them
// trivially testable and safe to share with both server cron jobs and
// client-side ticks.

import type { MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { projectMonth } from "@/lib/projections";
import { buildCardPressure } from "@/lib/card-pressure";
import { detectStaleAnchors } from "@/lib/anchor-staleness";
import {
  DEFAULT_THRESHOLDS,
  type Reminder,
  type ReminderEvaluatorInput,
  type ReminderThresholds,
} from "./types";

export function evaluateReminders(args: ReminderEvaluatorInput): Reminder[] {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = monthKeyOf(now);
  const today = now.getDate();
  const thresholds: ReminderThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...args.thresholds,
  };
  const out: Reminder[] = [];

  // 1. Unpaid recurring obligations — rules whose dayOfMonth is in the
  //    past for this calendar month and have no `paid` status row.
  const paidThisMonth = new Set(
    args.statuses
      .filter((s) => s.monthKey === monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (paidThisMonth.has(rule.id)) continue;
    if (rule.dayOfMonth > today) continue;
    out.push({
      key: `unpaid_recurring:${rule.id}:${monthKey}`,
      kind: "unpaid_recurring",
      severity: "warn",
      title: `חיוב לא משויך — ${rule.label}`,
      body: `יום החיוב (${rule.dayOfMonth} בחודש) חלף ועדיין אין התאמה.`,
      dueAt: now.toISOString(),
      deepLink: "/?tab=settings&panel=recurring",
      source: { monthKey, entityId: rule.id },
    });
  }

  // 2. High card pressure — totalThisMonth / creditLimit crosses the
  //    threshold. Only fires for cards with an explicit creditLimit.
  const pressures = buildCardPressure({
    accounts: args.accounts,
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey,
    now,
  });
  for (const p of pressures) {
    if (!p.card.creditLimit || p.card.creditLimit <= 0) continue;
    const ratio = p.totalThisMonth / p.card.creditLimit;
    if (ratio < thresholds.cardPressureWarn) continue;
    out.push({
      key: `high_card_pressure:${p.card.id}:${monthKey}`,
      kind: "high_card_pressure",
      severity: ratio >= 1 ? "critical" : "warn",
      title: `עומס גבוה על ${p.card.label}`,
      body: `העומס החודשי הוא ${Math.round(ratio * 100)}% מהמסגרת.`,
      dueAt: now.toISOString(),
      deepLink: "/?tab=dashboard",
      source: { monthKey, entityId: p.card.id },
    });
  }

  // 3. Budget approaching — actual + upcoming vs monthlyBudget.
  if (args.monthlyBudget > 0) {
    const proj = projectMonth({
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      monthKey,
      now,
    });
    const burnRatio = proj.projected / args.monthlyBudget;
    if (burnRatio >= thresholds.budgetWarn) {
      out.push({
        key: `budget_approaching:budget:${monthKey}`,
        kind: "budget_approaching",
        severity: burnRatio >= 1 ? "critical" : "warn",
        title:
          burnRatio >= 1
            ? "חרגת מהתקציב החודשי"
            : "מתקרבים לתקרת התקציב החודשי",
        body: `הוצאות צפויות: ${Math.round(burnRatio * 100)}% מהתקציב.`,
        dueAt: now.toISOString(),
        deepLink: "/?tab=dashboard",
        source: { monthKey },
      });
    }
  }

  // 4. Stale bank/card data — anchors that haven't been refreshed in
  //    `staleAnchorDays` days. Cards don't have anchors, so this is
  //    a bank-account-only signal today.
  const stale = detectStaleAnchors({
    accounts: args.accounts,
    now,
    watchDays: thresholds.staleAnchorDays,
  });
  for (const s of stale) {
    out.push({
      key: `stale_anchor:${s.accountId}:${monthKey}`,
      kind: "stale_anchor",
      severity: s.severity === "alert" ? "warn" : "info",
      title: `עדכן יתרה — ${s.label}`,
      body: `היתרה לא עודכנה כבר ${s.daysSinceUpdate} ימים.`,
      dueAt: now.toISOString(),
      deepLink: "/?tab=settings&panel=accounts",
      source: { monthKey, entityId: s.accountId },
    });
  }

  return out;
}
