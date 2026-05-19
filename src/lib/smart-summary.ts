// Smart-summary engine — converts a financial snapshot into one or two
// human-readable Hebrew sentences. Goal: the user reads a single line
// and understands "I'm OK / I have a deficit / a salary is coming /
// this loan is heavy" without scanning a dozen tiles.
//
// Pure module — no React, no store coupling. Output is an array of
// `{ tone, text }` strings the UI can render however it wants.

import type {
  Income,
  Loan,
} from "@/types/finance";
import type { FinancialSnapshot } from "@/lib/financial-snapshot";

export type SummaryTone = "calm" | "watch" | "warn" | "danger" | "positive";

export type SummaryLine = {
  tone: SummaryTone;
  text: string;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function dayWord(day: number): string {
  if (day === 1) return "ב-1 לחודש";
  return `ביום ${day}`;
}

function nextSalary(incomes: Income[], today: number): Income | null {
  const active = incomes.filter((i) => i.active);
  if (active.length === 0) return null;
  const upcoming = active
    .filter((i) => i.dayOfMonth >= today)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  return upcoming[0] ?? active.sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0];
}

/** Loan whose monthly installment is the largest single share of total
 *  monthly income. Returns null when no income is configured. */
function heaviestLoan(
  loans: Loan[],
  totalMonthlyIncome: number,
): { loan: Loan; pct: number } | null {
  if (totalMonthlyIncome <= 0) return null;
  const active = loans.filter((l) => l.active && l.monthlyInstallment > 0);
  if (active.length === 0) return null;
  const sorted = [...active].sort(
    (a, b) => b.monthlyInstallment - a.monthlyInstallment,
  );
  const top = sorted[0];
  const pct = Math.round((top.monthlyInstallment / totalMonthlyIncome) * 100);
  return { loan: top, pct };
}

export function buildSmartSummary(args: {
  snapshot: FinancialSnapshot;
  incomes: Income[];
  loans: Loan[];
  today?: Date;
}): SummaryLine[] {
  const now = args.today ?? new Date();
  const todayDay = now.getDate();
  const s = args.snapshot;
  const lines: SummaryLine[] = [];

  // 1. Headline — pick the strongest signal.
  const overdraft = s.expectedOverdraft;
  const nextSal = nextSalary(args.incomes, todayDay);
  const incomeRemaining = s.expectedIncomeUntilNextMonth;

  if (overdraft > 0) {
    if (nextSal && incomeRemaining > 0 && incomeRemaining >= overdraft) {
      const after = incomeRemaining - overdraft;
      lines.push({
        tone: "watch",
        text: `המשכורת ${dayWord(nextSal.dayOfMonth)} תכסה את ה-${ILS.format(
          overdraft,
        )} שבחריגה ותשאיר ${ILS.format(after)} נטו.`,
      });
    } else {
      lines.push({
        tone: "danger",
        text: `החודש צפוי להסתיים בחריגה של ${ILS.format(overdraft)}. ${
          nextSal
            ? `המשכורת ${dayWord(nextSal.dayOfMonth)} לבדה לא תכסה.`
            : "אין משכורת מתוזמנת לסגירת הפער."
        }`,
      });
    }
  } else if (s.riskLevel === "tight" || s.riskLevel === "watch") {
    lines.push({
      tone: "watch",
      text: `סיום החודש צפוי ב-${ILS.format(
        s.projectedBalanceOnFirstOfNextMonth,
      )} — מרווח דק. עקוב אחר חיובים גדולים בימים הקרובים.`,
    });
  } else {
    lines.push({
      tone: "positive",
      text: `מצב יציב — צפוי סיום חודש ב-${ILS.format(
        s.projectedBalanceOnFirstOfNextMonth,
      )} ועוד ${ILS.format(s.safeToSpendUntilMonthEnd)} זמינים לבחירה.`,
    });
  }

  // 2. Daily-allowance line — calmer prompt about pacing.
  if (s.dailySafeToSpend > 0 && s.daysRemainingInMonth > 1) {
    lines.push({
      tone: "calm",
      text: `אחרי הוצאות קבועות נשארים ${ILS.format(
        s.dailySafeToSpend,
      )} ליום עד סוף החודש.`,
    });
  }

  // 3. Loan share — only when meaningful (>10% of monthly income).
  const totalIncome = args.incomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.amount, 0);
  const heavy = heaviestLoan(args.loans, totalIncome);
  if (heavy && heavy.pct >= 10) {
    lines.push({
      tone: heavy.pct >= 25 ? "warn" : "calm",
      text: `“${heavy.loan.label}” צורך ${heavy.pct}% מהמשכורת החודשית.`,
    });
  }

  return lines;
}
