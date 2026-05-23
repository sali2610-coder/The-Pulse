// Single source of truth for every "איך זה מחושב?" sheet.
//
// Each metric the dashboard surfaces has a deterministic formula
// rendered as a list of lines (label + signed amount + meta). The
// UI just maps these — it does NOT re-derive any math here. Numbers
// come from monthlySpent / accountBridge / forecastEndOfMonth so
// every explanation matches what the card actually shows.

import type { AccountBridge } from "@/lib/account-bridge";
import type { MonthlySpent } from "@/lib/monthly-spent";

export type FormulaLine = {
  /** Hebrew label rendered verbatim. */
  label: string;
  /** Signed contribution to the metric, in ILS. Positive adds, negative
   *  subtracts. UI tints accordingly. */
  amount: number;
  /** Free-text Hebrew explainer rendered as a small sub-line. */
  meta?: string;
  /** When true, this row is the running total / final answer, not a
   *  contribution. UI bolds it. */
  total?: boolean;
};

export type Explanation = {
  /** Stable id for telemetry / deep-link. */
  id: string;
  /** Hebrew headline for the explain sheet. */
  title: string;
  /** Hebrew one-liner above the formula. */
  intro: string;
  /** Formula rows, top → bottom in display order. The final row
   *  should be marked `total: true`. */
  lines: FormulaLine[];
  /** Exclusion bullets ("not counted: refunds, FX, …"). Helps users
   *  understand what the number deliberately leaves out. */
  exclusions: string[];
};

export function explainMonthlySpent(spent: MonthlySpent): Explanation {
  return {
    id: "spent_this_month",
    title: "איך מחשבים ״הוצאתי החודש״",
    intro:
      "סכום החיובים שכבר נכנסו החודש בלבד. לא תלוי ביתרת הבנק ולא בתחזית.",
    lines: [
      {
        label: "חיובים בפועל מתחילת החודש",
        amount: spent.spentSoFar,
        meta: `${spent.charges} חיובים`,
      },
      {
        label: "זיכויים החודש",
        amount: spent.refundCredit,
        meta: "מוצגים בנפרד, לא מקזזים מהסכום הראשי",
      },
      {
        label: "סה״כ הוצאתי החודש",
        amount: spent.spentSoFar,
        total: true,
      },
    ],
    exclusions: [
      "יתרת הבנק וההלוואות",
      "חיובים עתידיים שעוד יקרו החודש",
      "חיובים שעוד ממתינים לאישור (Wallet / תלוי ועומד)",
      "חיובים שסומנו להחרגה מתקציב",
      "מטבעות זרים — נספרים בנפרד",
    ],
  };
}

export function explainAccountBridge(bridge: AccountBridge): Explanation {
  return {
    id: "account_bridge",
    title: "איך מחשבים ״יתרה צפויה אחרי כל ההתחייבויות״",
    intro:
      "יתרת הבנק הנוכחית, בתוספת הכנסה שעוד מצופה, פחות כל ההתחייבויות שעוד אמורות לרדת החודש.",
    lines: [
      {
        label: "יתרה נוכחית בבנק",
        amount: bridge.currentBankBalance,
        meta: "סכום העוגנים החיים של חשבונות הבנק הפעילים",
      },
      {
        label: "הכנסות שעוד יגיעו החודש",
        amount: bridge.expectedIncomeRemaining,
        meta: "הכנסות פעילות שיום קבלתן עוד לא חלף",
      },
      {
        label: "הוצאות קבועות שעוד צפויות",
        amount: -bridge.pendingFixed,
        meta: "כללים שעדיין במצב Pending החודש",
      },
      {
        label: "הלוואות שעוד ירדו",
        amount: -bridge.pendingLoans,
        meta: "תשלום חודשי × יום חיוב עתידי",
      },
      {
        label: "חיובי כרטיס שעוד צפויים",
        amount: -bridge.pendingCardCharges,
        meta: "פרוסות מתוך פלאנים שעוד לא חויבו",
      },
      {
        label: "יתרה צפויה לסוף החודש",
        amount: bridge.expectedBalanceAfterAllObligations,
        total: true,
      },
    ],
    exclusions: [
      "חיובים שכבר ירדו — משוקפים ביתרת הבנק",
      "החזרים (זיכויים) — נספרים בכרטיס הוצאות",
      "פלאן בכרטיס נספר פעם אחת — או דרך הכלל המקושר או דרך הפרוסה, לא שניהם",
    ],
  };
}
