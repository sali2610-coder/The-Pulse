// Smart Alerts Center — composes existing engine outputs into
// one flat list of one-liner alerts consumed by the compact
// Settings alerts center.
//
// Pure function. No React, no store coupling. Reuses:
//   • buildMonthlyDigest        — eom, pace, budget, overdraft, anomalies, subs, pressure
//   • summarizeLoans + loanSchedule — final-payment detection
//   • detectAnomalies           — for the אלגנטי "חיוב חריג" preview row
//   • pendingRulesForMonth      — for "חיוב שמתקרב"
//   • installmentProgress       — for "תשלום אחרון" on manual entries
//   • incomeForMonth            — for "הכנסה שהתקבלה"
//   • account.creditLimit + account.currentDebt — for "אשראי מתקרב למסגרת"

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

import { buildMonthlyDigest, type InsightTone } from "@/lib/insights";
import { pendingRulesForMonth, installmentProgress } from "@/lib/projections";
import { loanSchedule } from "@/lib/installment-schedule";
import { incomeForMonth } from "@/lib/income-month";
import { dayWithinMonth } from "@/lib/dates";

export type AlertKind =
  | "eom"
  | "pace"
  | "budget"
  | "overdraft"
  | "anomaly"
  | "subs"
  | "pressure"
  | "loan-final"
  | "charge-upcoming"
  | "installment-final"
  | "income-received"
  | "credit-limit";

export type AlertLevel = "important" | "info" | "good";

export type SmartAlert = {
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Rich body shown inside the Bottom Sheet — short paragraphs. */
  body: string[];
  value?: number;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

function levelForTone(tone: InsightTone): AlertLevel {
  if (tone === "danger" || tone === "warning") return "important";
  if (tone === "positive") return "good";
  return "info";
}

export function buildSmartAlerts(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  monthKey: MonthKey;
  now?: Date;
}): SmartAlert[] {
  const now = args.now ?? new Date();
  const out: SmartAlert[] = [];

  // 1. Insights digest (eom / pace / budget / overdraft / anomalies / subs / pressure).
  const digest = buildMonthlyDigest(args);
  for (const ins of digest) {
    out.push({
      id: `digest:${ins.id}`,
      kind: mapDigestKind(ins.id),
      level: levelForTone(ins.tone),
      tone: ins.tone,
      title: composeDigestTitle(ins.id, ins.headline),
      detail: ins.detail ?? ins.headline,
      body: buildDigestBody(ins.id, ins.headline, ins.detail),
      value: ins.value,
    });
  }

  // 2. Loans finishing this month (חיוב אחרון של הלוואה).
  for (const loan of args.loans) {
    if (!loan.active) continue;
    const sched = loanSchedule(loan, args.monthKey);
    if (sched.active && sched.remaining === 0) {
      out.push({
        id: `loan-final:${loan.id}`,
        kind: "loan-final",
        level: "good",
        tone: "positive",
        title: `${loan.label} — תשלום אחרון`,
        detail: `יום ${loan.dayOfMonth} החודש · ${ILS.format(loan.monthlyInstallment)}`,
        body: [
          `זה החיוב האחרון של ${loan.label}.`,
          `אחריו התשלום החודשי (${ILS.format(loan.monthlyInstallment)}) חוזר אליך.`,
        ],
      });
    }
  }

  // 3. Upcoming fixed charges in the next 5 days (חיוב שמתקרב).
  const pending = pendingRulesForMonth({
    rules: args.rules,
    statuses: args.statuses,
    monthKey: args.monthKey,
  });
  const soon = 5 * 86_400_000;
  for (const p of pending) {
    if (p.status?.status === "paid") continue;
    const diff = p.expectedDate.getTime() - now.getTime();
    if (diff < 0 || diff > soon) continue;
    const days = Math.max(0, Math.round(diff / 86_400_000));
    out.push({
      id: `charge-upcoming:${p.rule.id}`,
      kind: "charge-upcoming",
      level: "info",
      tone: "neutral",
      title: `${p.rule.label} — ${days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`}`,
      detail: `${ILS.format(p.rule.estimatedAmount)} · ${DATE_FMT.format(p.expectedDate)}`,
      body: [
        `חיוב חוזר של ${p.rule.label}.`,
        `סכום צפוי: ${ILS.format(p.rule.estimatedAmount)}.`,
        `תאריך חיוב: ${DATE_FMT.format(p.expectedDate)}.`,
      ],
    });
  }

  // 4. Installment final payment on manual entries (תשלום אחרון).
  for (const e of args.entries) {
    if (e.installments <= 1) continue;
    const prog = installmentProgress(e, now);
    if (prog.isComplete) continue;
    if (prog.remaining === 1 && prog.nextChargeDate) {
      const diff = prog.nextChargeDate.getTime() - now.getTime();
      if (diff < 0 || diff > 30 * 86_400_000) continue;
      const slice = Math.round(e.amount / e.installments);
      const label = e.merchant ?? e.note ?? "תשלום";
      out.push({
        id: `installment-final:${e.id}`,
        kind: "installment-final",
        level: "good",
        tone: "positive",
        title: `${label} — תשלום אחרון`,
        detail: `${ILS.format(slice)} · ${DATE_FMT.format(prog.nextChargeDate)}`,
        body: [
          `זה החיוב האחרון בפריסה של ${label}.`,
          `${e.installments}/${e.installments} תשלומים.`,
          `סכום כולל: ${ILS.format(e.amount)}.`,
        ],
      });
    }
  }

  // 5. Income received this month (הכנסה שהתקבלה).
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    const actual = inc.actualByMonth?.[args.monthKey];
    if (typeof actual !== "number" || actual <= 0) continue;
    const expected = inc.amount;
    const pct = expected > 0 ? Math.round((actual / expected) * 100) : 100;
    const tone: InsightTone = pct >= 97 ? "positive" : pct >= 50 ? "warning" : "danger";
    out.push({
      id: `income-received:${inc.id}:${args.monthKey}`,
      kind: "income-received",
      level: tone === "positive" ? "good" : "important",
      tone,
      title: `${inc.label} — התקבל ${ILS.format(actual)}`,
      detail: `${pct}% מהצפי (${ILS.format(expected)})`,
      body: [
        `סומן כהתקבל: ${ILS.format(actual)}.`,
        `צפי: ${ILS.format(expected)}.`,
        `התאמה: ${pct}%.`,
      ],
    });
  }

  // 6. Credit near limit (אשראי מתקרב למסגרת).
  for (const acc of args.accounts) {
    if (!acc.active || acc.kind !== "card") continue;
    if (typeof acc.creditLimit !== "number" || acc.creditLimit <= 0) continue;
    if (typeof acc.currentDebt !== "number") continue;
    const pct = Math.min(999, Math.round((acc.currentDebt / acc.creditLimit) * 100));
    if (pct < 75) continue;
    const tone: InsightTone = pct >= 90 ? "danger" : "warning";
    out.push({
      id: `credit-limit:${acc.id}`,
      kind: "credit-limit",
      level: "important",
      tone,
      title: `${acc.label} — ${pct}% מהמסגרת`,
      detail: `${ILS.format(acc.currentDebt)} מתוך ${ILS.format(acc.creditLimit)}`,
      body: [
        `שימוש: ${ILS.format(acc.currentDebt)}.`,
        `מסגרת: ${ILS.format(acc.creditLimit)}.`,
        `אחוז ניצול: ${pct}%.`,
      ],
    });
  }

  // Deterministic sort — important first, then info, then good.
  const rank: Record<AlertLevel, number> = { important: 0, info: 1, good: 2 };
  const toneRank: Record<InsightTone, number> = {
    danger: 0,
    warning: 1,
    neutral: 2,
    positive: 3,
  };
  out.sort((a, b) => {
    const l = rank[a.level] - rank[b.level];
    if (l !== 0) return l;
    return toneRank[a.tone] - toneRank[b.tone];
  });

  return out;
}

function mapDigestKind(id: string): AlertKind {
  switch (id) {
    case "eom": return "eom";
    case "pace": return "pace";
    case "budget": return "budget";
    case "overdraft": return "overdraft";
    case "anomalies": return "anomaly";
    case "subs": return "subs";
    case "pressure": return "pressure";
    default: return "eom";
  }
}

function composeDigestTitle(id: string, headline: string): string {
  switch (id) {
    case "eom": return `צפי סוף חודש · ${headline}`;
    case "pace": return `קצב לעומת חודש קודם · ${headline}`;
    case "budget": return `תקציב · ${headline}`;
    case "overdraft": return headline;
    case "anomalies": return `חיובים חריגים · ${headline}`;
    case "subs": return `מנויים חדשים · ${headline}`;
    case "pressure": return `לחץ חודש הבא · ${headline}`;
    default: return headline;
  }
}

function buildDigestBody(
  id: string,
  headline: string,
  detail?: string,
): string[] {
  const body: string[] = [];
  if (detail) body.push(detail);
  switch (id) {
    case "eom":
      body.push("מבוסס על יתרת הבנק, הכנסות והתחייבויות פעילות.");
      break;
    case "pace":
      body.push("השוואה ליום המקביל בחודש הקודם.");
      break;
    case "budget":
      body.push("כולל חיובים בפועל + פרוסות עתידיות + קבועות pending.");
      break;
    case "overdraft":
      body.push("תחזית לפי לוח הזמנים של הכנסות והתחייבויות ב-6 החודשים.");
      break;
    case "anomalies":
      body.push("מוצא חיובים שגדולים משמעותית מהממוצע ההיסטורי של אותו בית עסק.");
      break;
    case "subs":
      body.push("חיובים חוזרים אצל אותו ספק שלא הוגדרו כהוצאה קבועה.");
      break;
    case "pressure":
      body.push("סה״כ קבועות + הלוואות + תשלומים פרוסים לחודש הבא.");
      break;
    default:
      if (headline && !detail) body.push(headline);
  }
  return body;
}

// helper for callers that already have a dayOfMonth-based date but
// want to keep the tree lean — exposes the shared date helper.
export { dayWithinMonth };
