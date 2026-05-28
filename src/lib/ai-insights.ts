// Phase 273 — AI Financial Copilot engine.
//
// Behavior-aware insight pipeline that turns the raw store state
// into a prioritized, grouped list of conversational Hebrew insights.
//
// Design rules:
//   • No external LLM. Every insight is derived from the existing
//     engine modules (forecast, liquidity-curve, risk-warnings,
//     subscription/dormant/drift detectors).
//   • Quality > quantity. Each detector returns null when its
//     signal is weak — the engine never emits filler.
//   • Conversational, not robotic. Bodies read like a financial
//     advisor talking, not a system alert.
//   • Deterministic ordering. Insights are sorted by a single
//     priority score derived from severity / urgency / confidence
//     so the most important one always sits at the top.
//
// This module is pure compute. UI layers import `gatherAiInsights`
// and render the grouped output.

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
  categoryTrends,
  forecastEndOfMonth,
  monthOverMonthTotals,
  dayOfWeekSpend,
} from "@/lib/forecast";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { detectRuleDrift } from "@/lib/rule-drift";
import { detectDormantRules } from "@/lib/rule-dormancy";
import { ruleSchedule } from "@/lib/installment-schedule";
import { categoryTotals, sliceForMonth } from "@/lib/projections";
import { getCategory, type CategoryId } from "@/lib/categories";
import { isInsightDismissed } from "@/lib/insight-dismiss";
import { addMonths } from "@/lib/dates";

export type AiInsightGroup =
  | "risk"
  | "opportunity"
  | "trend"
  | "prediction"
  | "positive"
  | "recommendation";

export type AiInsightSeverity = 1 | 2 | 3; // calm / heads-up / urgent
export type AiInsightUrgency = 1 | 2 | 3; // someday / soon / now

export type AiInsight = {
  id: string;
  group: AiInsightGroup;
  severity: AiInsightSeverity;
  urgency: AiInsightUrgency;
  /** 0..1. Detectors below ~0.5 are filtered out. */
  confidence: number;
  title: string;
  /** One-line conversational summary. */
  body: string;
  /** "Why this matters" — slightly more context, expandable in UI. */
  why?: string;
  /** Suggested next step. */
  action?: string;
  /** severity*3 + urgency*2 + confidence*5 — used for sort + capping. */
  priority: number;
};

export type AiInsightsResult = {
  insights: AiInsight[];
  byGroup: Record<AiInsightGroup, AiInsight[]>;
  total: number;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const fmtPct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`;
const fmtILS = (n: number) => ILS.format(Math.round(n));

const MIN_CONFIDENCE = 0.5;

function priorityOf(
  severity: AiInsightSeverity,
  urgency: AiInsightUrgency,
  confidence: number,
): number {
  return severity * 3 + urgency * 2 + confidence * 5;
}

function emit(
  partial: Omit<AiInsight, "priority">,
): AiInsight | null {
  if (partial.confidence < MIN_CONFIDENCE) return null;
  return {
    ...partial,
    priority: priorityOf(
      partial.severity,
      partial.urgency,
      partial.confidence,
    ),
  };
}

export type AiInsightsInputs = {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
};

// ──────────────────────────────────────────────────────────────────
// Individual detectors. Each is pure and returns null when its
// signal isn't strong enough to surface.

function detectLiquidityDip(args: AiInsightsInputs): AiInsight | null {
  const curve = liquidityCurve({
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
  });
  if (!curve.crossesNegative) return null;
  const day = curve.lowestPoint.dayIndex;
  return emit({
    id: "liquidity-dip",
    group: "risk",
    severity: day <= 7 ? 3 : 2,
    urgency: day <= 3 ? 3 : day <= 14 ? 2 : 1,
    confidence: 0.9,
    title:
      day === 0
        ? "התזרים שלך עלול לרדת לאיזון שלילי כבר היום."
        : `התזרים שלך עלול לרדת לאיזון שלילי בעוד ${day} ימים.`,
    body: `הנקודה הנמוכה הצפויה בחישוב היא ${fmtILS(curve.lowestPoint.balance)}.`,
    why: "החישוב משלב משכורות, הלוואות, חיובי כרטיס וקבועים על פני 30 הימים הבאים.",
    action: "שקול לדחות חיוב גדול או להזרים מזומן לחשבון לפני התאריך הזה.",
  });
}

function detectForecastBreach(args: AiInsightsInputs): AiInsight | null {
  // Only meaningful when we actually have anchors to forecast against.
  const activeAnchors = args.accounts.filter(
    (a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined,
  );
  if (activeAnchors.length === 0) return null;
  const f = forecastEndOfMonth({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    monthKey: args.monthKey,
  });
  // Risk threshold: end-of-month balance projected below a comfortable
  // floor. We pick 10% of pending obligations as the floor — a soft
  // buffer that scales with the month's commitments.
  const floor = (f.pendingFixed + f.pendingLoans + f.futureCardSlices) * 0.1;
  if (f.forecast >= floor) return null;
  const sev: AiInsightSeverity =
    f.forecast < 0 ? 3 : f.forecast < floor / 2 ? 2 : 1;
  return emit({
    id: "forecast-breach",
    group: "prediction",
    severity: sev,
    urgency: 2,
    confidence: 0.85,
    title:
      f.forecast < 0
        ? `בקצב הזה, היתרה הצפויה לסוף החודש תהיה ${fmtILS(f.forecast)}.`
        : `היתרה הצפויה לסוף החודש מצומצמת: ${fmtILS(f.forecast)}.`,
    body: `מתחילים מ-${fmtILS(f.totalAnchors)} בבנק, מקבלים ${fmtILS(f.expectedIncome)} הכנסה צפויה, ומתחייבים ל-${fmtILS(f.pendingFixed + f.pendingLoans + f.futureCardSlices)} ביציאות.`,
    why: "התחזית מבוססת על חיובי כרטיס עתידיים, הוצאות קבועות, הלוואות והכנסות שעוד לא הגיעו.",
    action:
      f.forecast < 0
        ? "שקול לדחות חיובים גדולים או להזרים הכנסה נוספת השבוע."
        : "שמור על מרווח — עדיף לא להוסיף הוצאות חדשות גדולות עד תחילת החודש הבא.",
  });
}

function detectFixedObligationsHeavy(
  args: AiInsightsInputs,
): AiInsight | null {
  if (args.incomes.length === 0) return null;
  const monthlyIncome = args.incomes
    .filter((i) => i.active)
    .reduce((acc, i) => acc + i.amount, 0);
  if (monthlyIncome <= 0) return null;

  // Sum recurring rules firing this month (open-ended + active
  // installment rules).
  let recurring = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    const sched = ruleSchedule(rule, args.monthKey);
    if (!sched.active) continue;
    recurring += rule.estimatedAmount;
  }
  // Plus active loans firing this month (use monthly installment).
  const loans = args.loans
    .filter((l) => l.active && (l.remainingBalance ?? 1) > 0)
    .reduce((acc, l) => acc + l.monthlyInstallment, 0);

  const fixed = recurring + loans;
  if (fixed <= 0) return null;
  const ratio = fixed / monthlyIncome;
  if (ratio < 0.6) return null;
  const sev: AiInsightSeverity = ratio >= 0.85 ? 3 : ratio >= 0.7 ? 2 : 1;
  return emit({
    id: "fixed-obligations-heavy",
    group: "risk",
    severity: sev,
    urgency: 2,
    confidence: 0.8,
    title: `התחייבויות קבועות מהוות ${fmtPct(ratio)} מההכנסה החודשית שלך.`,
    body: `${fmtILS(fixed)} מתוך הכנסה של ${fmtILS(monthlyIncome)} הולכים לחיובים חוזרים והלוואות.`,
    why: "כשמעל 70% מההכנסה הולך לקבוע, נשאר מעט מאוד מרחב לבחירות חופשיות והפתעות.",
    action:
      "עבור על המנויים והקבועים בלשונית 'הוצאות' — אולי יש כפילות או דבר שניתן להקטין.",
  });
}

function detectSubscriptionsWeight(
  args: AiInsightsInputs,
): AiInsight | null {
  if (args.incomes.length === 0) return null;
  const monthlyIncome = args.incomes
    .filter((i) => i.active)
    .reduce((acc, i) => acc + i.amount, 0);
  if (monthlyIncome <= 0) return null;

  // Treat "subscription-like" as: recurring rules in entertainment /
  // bills with small fixed monthlies that aren't installments.
  let subs = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (rule.installmentTotal && rule.installmentTotal > 0) continue;
    if (rule.estimatedAmount > 250) continue; // typical sub band
    subs += rule.estimatedAmount;
  }
  if (subs < 50) return null;
  const ratio = subs / monthlyIncome;
  if (ratio < 0.08) return null;
  const sev: AiInsightSeverity = ratio >= 0.15 ? 2 : 1;
  return emit({
    id: "subscriptions-weight",
    group: "opportunity",
    severity: sev,
    urgency: 1,
    confidence: 0.7,
    title: `מנויים חודשיים תופסים כ-${fmtPct(ratio)} מההכנסה שלך.`,
    body: `סך המנויים הקבועים שזיהינו: ${fmtILS(subs)}. לרוב יש פה 1–2 שהפסקת להשתמש בהם.`,
    why: "מנויים קטנים מצטברים בשקט — שווה לעבור על הרשימה אחת לרבעון.",
    action: "לך ל-Settings → הצעות חכמות וסקור את המנויים המזוהים.",
  });
}

function detectCategorySpike(args: AiInsightsInputs): AiInsight | null {
  const trends = categoryTrends({
    entries: args.entries,
    monthKey: args.monthKey,
    lookback: 3,
  });
  const candidates = trends
    .filter(
      (t) =>
        t.priorAverage > 50 &&
        t.deltaPct !== null &&
        t.deltaPct >= 0.3 &&
        t.thisMonth > 0,
    )
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0));
  if (candidates.length === 0) return null;
  const top = candidates[0];
  const meta = getCategory(top.category as CategoryId);
  const pctVal = Math.abs(top.deltaPct ?? 0);
  const sev: AiInsightSeverity = pctVal >= 0.6 ? 3 : pctVal >= 0.4 ? 2 : 1;
  return emit({
    id: `category-spike-${top.category}`,
    group: "trend",
    severity: sev,
    urgency: 2,
    confidence: 0.85,
    title: `הוצאות ${meta.label} עלו ב-${fmtPct(pctVal)} החודש.`,
    body: `החודש: ${fmtILS(top.thisMonth)}. ממוצע 3 חודשים אחרונים: ${fmtILS(top.priorAverage)}.`,
    why: "עלייה משמעותית בקטגוריה אחת היא בדרך כלל סימן לשינוי הרגלים — שווה לבדוק מה תרם לה.",
    action: `פתח את ${meta.label} בלשונית 'הוצאות' ובדוק אילו פריטים תרמו.`,
  });
}

function detectCategoryDrop(args: AiInsightsInputs): AiInsight | null {
  const trends = categoryTrends({
    entries: args.entries,
    monthKey: args.monthKey,
    lookback: 3,
  });
  const candidates = trends
    .filter(
      (t) =>
        t.priorAverage > 50 &&
        t.deltaPct !== null &&
        t.deltaPct <= -0.25 &&
        t.thisMonth >= 0,
    )
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
  if (candidates.length === 0) return null;
  const top = candidates[0];
  const meta = getCategory(top.category as CategoryId);
  const pctVal = Math.abs(top.deltaPct ?? 0);
  return emit({
    id: `category-drop-${top.category}`,
    group: "positive",
    severity: 1,
    urgency: 1,
    confidence: 0.85,
    title: `יפה — הוצאות ${meta.label} ירדו ב-${fmtPct(pctVal)} החודש.`,
    body: `החודש: ${fmtILS(top.thisMonth)} לעומת ממוצע ${fmtILS(top.priorAverage)} בחודשים הקודמים.`,
    why: "כשמתחילים לראות ירידה עקבית בקטגוריה, סימן שההרגל אכן השתנה ולא רק שהיה חודש חלש בעסקאות.",
    action: "המשך לעקוב — אם הירידה תחזיק 3 חודשים זה כבר הרגל חדש.",
  });
}

function detectNewTopCategory(args: AiInsightsInputs): AiInsight | null {
  function asPairs(
    m: Map<CategoryId, number>,
  ): Array<{ category: CategoryId; total: number }> {
    return Array.from(m.entries()).map(([category, total]) => ({
      category,
      total,
    }));
  }
  const thisTotals = asPairs(
    categoryTotals({ entries: args.entries, monthKey: args.monthKey }),
  );
  const lastKey = addMonths(args.monthKey, -1);
  const lastTotals = asPairs(
    categoryTotals({ entries: args.entries, monthKey: lastKey }),
  );
  if (thisTotals.length === 0 || lastTotals.length === 0) return null;
  const top = [...thisTotals].sort((a, b) => b.total - a.total)[0];
  const lastTop = [...lastTotals].sort((a, b) => b.total - a.total)[0];
  if (!top || !lastTop) return null;
  if (top.category === lastTop.category) return null;
  if (top.total < 200) return null;
  const meta = getCategory(top.category);
  return emit({
    id: `new-top-category-${top.category}`,
    group: "trend",
    severity: 2,
    urgency: 1,
    confidence: 0.75,
    title: `${meta.label} הפכה לקטגוריה הגדולה ביותר שלך החודש.`,
    body: `סך הוצאות החודש בקטגוריה: ${fmtILS(top.total)}.`,
    why: "שינוי בקטגוריה המובילה לרוב משקף שינוי בסדרי העדיפויות או בנסיבות החיים.",
    action: "בדוק האם המעבר הזה תכנוני או הפתעה.",
  });
}

function detectInstallmentLoadEnding(
  args: AiInsightsInputs,
): AiInsight | null {
  const nextKey = addMonths(args.monthKey, 1);
  let endingCount = 0;
  let endingMonthly = 0;
  for (const rule of args.rules) {
    if (!rule.active) continue;
    if (!rule.installmentTotal || rule.installmentTotal <= 1) continue;
    const here = ruleSchedule(rule, args.monthKey);
    const there = ruleSchedule(rule, nextKey);
    if (here.active && !there.active) {
      endingCount += 1;
      endingMonthly += rule.estimatedAmount;
    }
  }
  // Also check installment ExpenseEntry slices.
  for (const entry of args.entries) {
    if (entry.installments <= 1) continue;
    const here = sliceForMonth(entry, args.monthKey);
    const there = sliceForMonth(entry, nextKey);
    if (here && !there) {
      endingCount += 1;
      endingMonthly += entry.amount / entry.installments;
    }
  }
  if (endingCount === 0 || endingMonthly < 100) return null;
  return emit({
    id: "installment-load-ending",
    group: "positive",
    severity: 1,
    urgency: 1,
    confidence: 0.9,
    title: `החודש הבא ${fmtILS(endingMonthly)} יפסיקו לחייב את הכרטיס שלך.`,
    body:
      endingCount === 1
        ? "תשלום אחד מסיים את התוכנית שלו."
        : `${endingCount} תשלומים מסיימים את התוכנית שלהם.`,
    why: "ירידה בעומס תשלומים משחררת מרחב לתקציב הבא — שווה לחשוב מראש לאן הסכום הזה ילך.",
    action: "תכנן מראש: לחיסכון, להפחתת חוב, או להחזר חלקי של הלוואה.",
  });
}

function detectStrongCashflow(args: AiInsightsInputs): AiInsight | null {
  const series = monthOverMonthTotals({
    entries: args.entries,
    monthKey: args.monthKey,
    count: 6,
  });
  if (series.length < 4) return null;
  const last = series[series.length - 1];
  if (last.total <= 0) return null;
  const others = series.slice(0, -1);
  if (others.every((m) => m.total === 0)) return null;
  const minOther = Math.min(...others.map((m) => m.total));
  // Strong = this month is the lowest spend across the lookback AND
  // at least 15% lower than the second-lowest.
  if (last.total > minOther) return null;
  const sorted = [...others].sort((a, b) => a.total - b.total);
  const secondLowest = sorted[0]?.total ?? 0;
  if (secondLowest <= 0) return null;
  const margin = (secondLowest - last.total) / secondLowest;
  if (margin < 0.1) return null;
  return emit({
    id: "strong-cashflow-month",
    group: "positive",
    severity: 1,
    urgency: 1,
    confidence: 0.7,
    title: `זה החודש החזק ביותר שלך מבחינה תזרימית ב-${others.length} החודשים האחרונים.`,
    body: `הוצאת ${fmtILS(last.total)} מול ממוצע גבוה יותר בחודשים הקודמים.`,
    why: "חודש שקט מבחינה תזרימית הוא הזמן הטוב ביותר לבנות כרית ביטחון.",
    action: "שקול להעביר חלק מההפרש לחיסכון או להפחתת חוב.",
  });
}

function detectWeekdayPattern(args: AiInsightsInputs): AiInsight | null {
  const points = dayOfWeekSpend({
    entries: args.entries,
    monthKey: args.monthKey,
    monthsBack: 3,
  });
  const totalAll = points.reduce((acc, p) => acc + p.total, 0);
  if (totalAll < 1000) return null;
  const sorted = [...points].sort((a, b) => b.total - a.total);
  const top = sorted[0];
  if (top.total === 0) return null;
  const share = top.total / totalAll;
  // Heavy day if ≥ 22% of weekly spend on one weekday (1/7 ≈ 14%).
  if (share < 0.22) return null;
  const dayName = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][
    top.dayOfWeek
  ];
  return emit({
    id: `weekday-pattern-${top.dayOfWeek}`,
    group: "trend",
    severity: 1,
    urgency: 1,
    confidence: 0.65,
    title: `יום ${dayName} הוא היום החזק ביותר שלך בהוצאות.`,
    body: `כ-${fmtPct(share)} מסך ההוצאות שלך בשלושת החודשים האחרונים יוצא ביום ${dayName}.`,
    why: "זיהוי דפוס שבועי עוזר לתכנן: יום חזק זה לרוב סופ״ש, סידורים, או יום קניות שגרתי.",
  });
}

function detectFirstWeekConcentration(
  args: AiInsightsInputs,
): AiInsight | null {
  let total = 0;
  let firstWeek = 0;
  for (const entry of args.entries) {
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.amount <= 0) continue;
    total += slice.amount;
    if (slice.chargeDate.getDate() <= 7) {
      firstWeek += slice.amount;
    }
  }
  if (total < 1000) return null;
  const share = firstWeek / total;
  if (share < 0.5) return null;
  return emit({
    id: "first-week-concentration",
    group: "trend",
    severity: 1,
    urgency: 1,
    confidence: 0.7,
    title: `${fmtPct(share)} מההוצאות החודש כבר נפלו בשבוע הראשון.`,
    body: `בסה״כ ${fmtILS(firstWeek)} מתוך ${fmtILS(total)}.`,
    why: "כשרוב ההוצאה מרוכז בתחילת החודש, חשוב לוודא שמספיק נשאר לחיובים שבסוף.",
    action: "בדוק בלוח הזרימה מה צפוי לעוד 14 הימים הקרובים.",
  });
}

function detectRuleDriftInsight(args: AiInsightsInputs): AiInsight | null {
  const drifts = detectRuleDrift({
    rules: args.rules,
    entries: args.entries,
    statuses: args.statuses,
    monthKey: args.monthKey,
  })
    .filter((d) => !isInsightDismissed("rule-drift", d.ruleId))
    .sort(
      (a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1),
    );
  if (drifts.length === 0) return null;
  const top = drifts[0];
  const sev: AiInsightSeverity = top.severity === "alert" ? 2 : 1;
  return emit({
    id: `rule-drift-${top.ruleId}`,
    group: "opportunity",
    severity: sev,
    urgency: 1,
    confidence: 0.7,
    title:
      top.direction === "up"
        ? `${top.label} עולה יותר ממה שתכננת.`
        : `${top.label} פוחת — אולי שווה לעדכן את האומדן.`,
    body: `אומדן: ${fmtILS(top.estimatedAmount)}. בפועל החודש: ${fmtILS(top.currentActual)}.`,
    why: "אומדן לא מדויק של חיוב חוזר מטעה את התחזית שלך.",
    action: `עדכן את האומדן ל-${fmtILS(top.suggestedEstimate)} כדי לחדד את התחזית.`,
  });
}

function detectDormantSubscription(args: AiInsightsInputs): AiInsight | null {
  const dormant = detectDormantRules({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  })
    .filter((d) => !isInsightDismissed("dormant-rule", d.ruleId))
    .sort((a, b) => b.dormantMonths - a.dormantMonths);
  if (dormant.length === 0) return null;
  const top = dormant[0];
  return emit({
    id: `dormant-${top.ruleId}`,
    group: "opportunity",
    severity: 2,
    urgency: 1,
    confidence: 0.75,
    title: `${top.label} פעיל בהוצאות הקבועות אבל לא חויב כבר ${top.dormantMonths} חודשים.`,
    body: `אומדן חודשי שמושך פנדינג לתחזית: ${fmtILS(top.estimatedAmount)}.`,
    why: "חוק קבוע שלא חויב לאורך זמן ימשיך לנפח את 'התחייבויות החודש' באופן מטעה.",
    action: "כבה את החוק או מחק אותו אם הסיכון נגמר.",
  });
}

function detectSubscriptionCandidate(
  args: AiInsightsInputs,
): AiInsight | null {
  const cands = detectSubscriptionCandidates({
    entries: args.entries,
    rules: args.rules,
  })
    .filter((c) => !isInsightDismissed("subscription", c.merchantKey))
    .sort((a, b) => b.suggestedAmount - a.suggestedAmount);
  if (cands.length === 0) return null;
  const top = cands[0];
  const conf = top.confidence === "high" ? 0.85 : top.confidence === "medium" ? 0.7 : 0.55;
  return emit({
    id: `subscription-candidate-${top.merchantKey}`,
    group: "recommendation",
    severity: 1,
    urgency: 1,
    confidence: conf,
    title: `נראה שיש לך מנוי חודשי קבוע: ${top.displayName}.`,
    body: `כ-${fmtILS(top.suggestedAmount)} בחודש — לא הוגדר עדיין כחוק קבוע.`,
    why: "המרה לחוק קבוע מאפשרת מעקב טוב יותר אחרי תקציב המנויים הכולל שלך.",
    action: "פתח את ההצעות החכמות בהגדרות כדי להפוך את זה לחוק קבוע.",
  });
}

function detectPendingConfirmations(
  args: AiInsightsInputs,
): AiInsight | null {
  const pending = args.entries.filter(
    (e) => e.needsConfirmation && !e.confirmedAt,
  ).length;
  if (pending === 0) return null;
  return emit({
    id: "pending-confirmations",
    group: "recommendation",
    severity: 2,
    urgency: 3,
    confidence: 0.95,
    title:
      pending === 1
        ? "חיוב אחד ממתין לאישור שלך."
        : `${pending} חיובים ממתינים לאישור שלך.`,
    body: "עד שלא תאשר אותם, הם לא נכנסים לתחזית הסופית של החודש.",
    why: "חיובי Apple Pay חלקיים מחכים לזיהוי קטגוריה כדי להפוך לחלק מהתקציב.",
    action: "פתח את 'בית' — מגש ה-Pending בראש המסך.",
  });
}

function detectStayedOnBudget(args: AiInsightsInputs): AiInsight | null {
  if (args.monthlyBudget <= 0) return null;
  const now = args.now ?? new Date();
  const day = now.getDate();
  // Only meaningful after the 25th — earlier, it's premature.
  if (day < 25) return null;
  let actual = 0;
  for (const entry of args.entries) {
    if (entry.excludeFromBudget) continue;
    if (entry.isRefund) continue;
    if (entry.currency && entry.currency !== "ILS") continue;
    if (entry.needsConfirmation) continue;
    if (entry.bankPending) continue;
    const slice = sliceForMonth(entry, args.monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() > now.getTime()) continue;
    actual += slice.amount;
  }
  if (actual >= args.monthlyBudget) return null;
  const margin = (args.monthlyBudget - actual) / args.monthlyBudget;
  if (margin < 0.05) return null;
  return emit({
    id: "stayed-on-budget",
    group: "positive",
    severity: 1,
    urgency: 1,
    confidence: 0.8,
    title: `אתה בנתיב להישאר בתוך התקציב שתכננת לחודש הזה.`,
    body: `מתוך ${fmtILS(args.monthlyBudget)} הוצאת עד היום ${fmtILS(actual)}.`,
    why: "להישאר בתקציב חודשי הוא הסימן הברור ביותר לתכנון פיננסי שעובד.",
    action: "המשך כך — בחודשי שיא של עומס תקציבי, רזרבה כזו שווה זהב.",
  });
}

// ──────────────────────────────────────────────────────────────────

const DETECTORS: Array<(args: AiInsightsInputs) => AiInsight | null> = [
  detectLiquidityDip,
  detectFixedObligationsHeavy,
  detectForecastBreach,
  detectSubscriptionsWeight,
  detectCategorySpike,
  detectCategoryDrop,
  detectNewTopCategory,
  detectInstallmentLoadEnding,
  detectStrongCashflow,
  detectWeekdayPattern,
  detectFirstWeekConcentration,
  detectRuleDriftInsight,
  detectDormantSubscription,
  detectSubscriptionCandidate,
  detectPendingConfirmations,
  detectStayedOnBudget,
];

const EMPTY_GROUPS: Record<AiInsightGroup, AiInsight[]> = {
  risk: [],
  opportunity: [],
  trend: [],
  prediction: [],
  positive: [],
  recommendation: [],
};

export function gatherAiInsights(args: AiInsightsInputs): AiInsightsResult {
  const insights: AiInsight[] = [];
  for (const detector of DETECTORS) {
    const out = detector(args);
    if (out) insights.push(out);
  }
  insights.sort((a, b) => b.priority - a.priority);

  const byGroup: Record<AiInsightGroup, AiInsight[]> = {
    risk: [],
    opportunity: [],
    trend: [],
    prediction: [],
    positive: [],
    recommendation: [],
  };
  for (const ins of insights) {
    byGroup[ins.group].push(ins);
  }
  void EMPTY_GROUPS;
  return {
    insights,
    byGroup,
    total: insights.length,
  };
}

export const GROUP_LABELS: Record<AiInsightGroup, string> = {
  risk: "סיכונים",
  opportunity: "הזדמנויות",
  trend: "מגמות",
  prediction: "תחזיות",
  positive: "התקדמות",
  recommendation: "המלצות AI",
};

export const GROUP_ORDER: AiInsightGroup[] = [
  "risk",
  "prediction",
  "opportunity",
  "trend",
  "positive",
  "recommendation",
];
