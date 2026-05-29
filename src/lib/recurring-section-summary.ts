// Phase 270 — recurring-obligations section summary.
//
// The "חיובים שיורדים אוטומטית כל חודש" section in the Expenses tab
// is reference / advanced material. Default-collapsed UX needs a
// header chip the user can scan without expanding:
//
//   • how many recurring sources fire this month
//   • total monthly obligation
//   • whether there's anything worth opening for (anomaly count)
//
// Pure derivation. No engine change. Reuses the existing detectors
// so the source-of-truth lives in one place.
//
// Anomalies surfaced:
//   - rule drift   (estimated vs. actual diverges)
//   - dormant rule (active, never paid for K months)
//   - subscription candidate (auto-detected recurring not yet ruled)
//   - ending soon  (installment plan has ≤ 1 payment left)
//
// "ending soon" is computed here from the schedule itself — it's a
// non-anomalous insight ("this charge is about to disappear from your
// monthly cost") that still deserves user attention.
//
// Insight count drives tone: 0 → "info" (quiet), >0 → "warn" (open me).

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { detectRuleDrift } from "@/lib/rule-drift";
import { detectDormantRules } from "@/lib/rule-dormancy";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { isInsightDismissed } from "@/lib/insight-dismiss";
import { ruleSchedule } from "@/lib/installment-schedule";

export type RecurringInsightItem = {
  /** Stable identifier — drives React keys + dismissal. */
  id: string;
  kind: "drift" | "dormant" | "subscription" | "endingSoon";
  /** Hebrew short label. */
  label: string;
  /** One-line context the UI surfaces under the label. */
  detail: string;
};

export type RecurringSectionSummary = {
  /** Distinct recurring sources firing in `monthKey`: active open-ended
   *  bills + active installment plans + active installment entries. */
  sourceCount: number;
  /** Sum of monthly obligations falling in `monthKey`. */
  monthlyTotal: number;
  insights: {
    drift: number;
    dormant: number;
    subscription: number;
    endingSoon: number;
    total: number;
  };
  /** Phase 289 — actual item list so the UI can answer "which 3?". */
  insightItems: RecurringInsightItem[];
  /** "info" when quiet, "warn" when at least one insight exists. */
  tone: "info" | "warn";
};

function entrySliceFallsInMonth(
  entry: ExpenseEntry,
  monthKey: MonthKey,
): { active: boolean; remaining: number } {
  if (entry.installments <= 1) return { active: false, remaining: 0 };
  const chargeMonth = entry.chargeDate.slice(0, 7);
  const [cy, cm] = chargeMonth.split("-").map(Number);
  const [my, mm] = monthKey.split("-").map(Number);
  const sliceIndex = (my - cy) * 12 + (mm - cm);
  if (sliceIndex < 0 || sliceIndex >= entry.installments) {
    return { active: false, remaining: 0 };
  }
  return {
    active: true,
    remaining: Math.max(0, entry.installments - (sliceIndex + 1)),
  };
}

function fmtILS(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function buildRecurringSectionSummary(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): RecurringSectionSummary {
  let sourceCount = 0;
  let monthlyTotal = 0;
  let endingSoon = 0;
  const insightItems: RecurringInsightItem[] = [];

  for (const rule of args.rules) {
    if (!rule.active) continue;
    const schedule = ruleSchedule(rule, args.monthKey);
    if (!schedule.active) continue;
    sourceCount += 1;
    monthlyTotal += rule.estimatedAmount;
    if (schedule.remaining !== undefined && schedule.remaining <= 1) {
      endingSoon += 1;
      insightItems.push({
        id: `endingSoon:rule:${rule.id}`,
        kind: "endingSoon",
        label: `${rule.label} מסתיים בקרוב`,
        detail: `נשארו ${schedule.remaining} תשלומים · ${fmtILS(rule.estimatedAmount)} לחודש`,
      });
    }
  }

  for (const entry of args.entries) {
    const slice = entrySliceFallsInMonth(entry, args.monthKey);
    if (!slice.active) continue;
    sourceCount += 1;
    monthlyTotal += entry.amount / entry.installments;
    if (slice.remaining <= 1) {
      endingSoon += 1;
      insightItems.push({
        id: `endingSoon:entry:${entry.id}`,
        kind: "endingSoon",
        label: `${entry.merchant ?? entry.note ?? "תשלום"} מסתיים בקרוב`,
        detail: `נשארו ${slice.remaining} תשלומים · ${fmtILS(entry.amount / entry.installments)} לחודש`,
      });
    }
  }

  const driftHits = detectRuleDrift({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("rule-drift", d.ruleId));
  for (const d of driftHits) {
    insightItems.push({
      id: `drift:${d.ruleId}`,
      kind: "drift",
      label: `${d.label} סוטה מהאומדן`,
      detail:
        d.direction === "up"
          ? `בפועל ${fmtILS(d.currentActual)} · אומדן ${fmtILS(d.estimatedAmount)} — שווה לעדכן`
          : `בפועל ${fmtILS(d.currentActual)} · אומדן ${fmtILS(d.estimatedAmount)} — האומדן גבוה מדי`,
    });
  }
  const drift = driftHits.length;

  const dormantHits = detectDormantRules({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  }).filter((d) => !isInsightDismissed("dormant-rule", d.ruleId));
  for (const d of dormantHits) {
    insightItems.push({
      id: `dormant:${d.ruleId}`,
      kind: "dormant",
      label: `${d.label} לא חויב כבר ${d.dormantMonths} חודשים`,
      detail: `מנפח את "התחייבויות החודש" באומדן ${fmtILS(d.estimatedAmount)} מבלי שחויב`,
    });
  }
  const dormant = dormantHits.length;

  const subHits = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  }).filter((c) => !isInsightDismissed("subscription", c.merchantKey));
  for (const c of subHits) {
    insightItems.push({
      id: `subscription:${c.merchantKey}`,
      kind: "subscription",
      label: `מנוי קבוע שזוהה: ${c.displayName}`,
      detail: `כ-${fmtILS(c.suggestedAmount)} בחודש — לא הוגדר כחוק קבוע`,
    });
  }
  const subscription = subHits.length;

  const total = drift + dormant + subscription + endingSoon;

  return {
    sourceCount,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    insights: { drift, dormant, subscription, endingSoon, total },
    insightItems,
    tone: total > 0 ? "warn" : "info",
  };
}
