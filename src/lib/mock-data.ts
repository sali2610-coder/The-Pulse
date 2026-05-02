import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, PaymentMethod, RecurringRule } from "@/types/finance";

type Scenario =
  | "balanced"
  | "over-budget"
  | "long-installment"
  | "cash-heavy"
  | "edge-cases";

type MockExpense = Omit<ExpenseEntry, "id" | "createdAt" | "matchedRuleId">;
type MockRule = Omit<RecurringRule, "id" | "createdAt">;

type MockSet = {
  expenses: MockExpense[];
  rules: MockRule[];
  monthlyBudget: number;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function isoDayThisMonth(day: number): string {
  const d = new Date();
  d.setDate(day);
  return d.toISOString();
}

function mk(
  amount: number,
  category: CategoryId,
  paymentMethod: PaymentMethod,
  daysAgo: number,
  installments = 1,
  note?: string,
): MockExpense {
  return {
    amount,
    category,
    paymentMethod,
    installments,
    chargeDate: isoDaysAgo(daysAgo),
    source: "manual",
    note,
  };
}

const SCENARIOS: Record<Scenario, MockSet> = {
  balanced: {
    monthlyBudget: 6000,
    rules: [
      {
        label: "חשמל",
        category: "bills",
        estimatedAmount: 320,
        dayOfMonth: 18,
        keywords: ["חשמל"],
        active: true,
      },
      {
        label: "ועד בית",
        category: "bills",
        estimatedAmount: 240,
        dayOfMonth: 1,
        keywords: ["ועד"],
        active: true,
      },
    ],
    expenses: [
      mk(89, "food", "credit", 5),
      mk(42, "transport", "cash", 4),
      mk(310, "shopping", "credit", 3, 3),
      mk(56, "food", "cash", 2),
      mk(180, "entertainment", "credit", 1),
    ],
  },
  "over-budget": {
    monthlyBudget: 3000,
    rules: [],
    expenses: [
      mk(1200, "shopping", "credit", 10, 3),
      mk(450, "entertainment", "credit", 6),
      mk(620, "food", "cash", 5),
      mk(900, "shopping", "credit", 3),
      mk(380, "transport", "credit", 2),
    ],
  },
  "long-installment": {
    monthlyBudget: 8000,
    rules: [],
    expenses: [
      // 12,000₪ split over 24 months → 500₪/month for 2 years
      mk(12000, "shopping", "credit", 14, 24, "מחשב נייד חדש"),
      mk(140, "food", "credit", 1),
    ],
  },
  "cash-heavy": {
    monthlyBudget: 5000,
    rules: [],
    expenses: [
      mk(80, "food", "cash", 8),
      mk(120, "food", "cash", 6),
      mk(200, "shopping", "cash", 5),
      mk(45, "transport", "cash", 4),
      mk(310, "entertainment", "cash", 3),
      mk(95, "food", "cash", 1),
    ],
  },
  "edge-cases": {
    monthlyBudget: 5000,
    rules: [
      {
        label: "אינטרנט",
        category: "bills",
        estimatedAmount: 99,
        dayOfMonth: 28,
        keywords: ["אינטרנט", "תקשורת"],
        active: true,
      },
    ],
    expenses: [
      // Large single purchase first day of month.
      { ...mk(2400, "shopping", "credit", 0, 1), chargeDate: isoDayThisMonth(1) },
      // Tiny coffee.
      mk(8.5, "food", "cash", 2),
      // Mid-installment from a previous month (would still slice into now).
      { ...mk(6000, "shopping", "credit", 45, 12) },
      // Will trigger keyword match against the "אינטרנט" rule.
      mk(105, "bills", "credit", 1, 1, "תשלום אינטרנט חודשי"),
    ],
  },
};

export const SCENARIO_LABELS: Record<Scenario, string> = {
  balanced: "מאוזן",
  "over-budget": "חריגה",
  "long-installment": "תשלומים ארוכים",
  "cash-heavy": "מזומן בעיקר",
  "edge-cases": "מקרי קצה",
};

export type { Scenario };
export { SCENARIOS };
