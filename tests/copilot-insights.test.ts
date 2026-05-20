import { describe, expect, it } from "vitest";

import { buildCopilotInsights } from "@/lib/copilot-insights";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";

const MONTH: MonthKey = "2026-05";
const NOW = new Date("2026-05-15T08:00:00.000Z");

function bank(anchor: number): Account {
  return {
    id: "bank1",
    kind: "bank",
    label: "Main",
    active: true,
    anchorBalance: anchor,
    anchorUpdatedAt: "2026-05-01T00:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function income(amount: number, day: number, label = "salary"): Income {
  return {
    id: `inc-${day}-${label}`,
    label,
    amount,
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function loan(amount: number, day: number, label = "car"): Loan {
  return {
    id: `loan-${label}`,
    label,
    monthlyInstallment: amount,
    remainingBalance: 50_000,
    endDate: "2030-01-01",
    dayOfMonth: day,
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function rule(amount: number, day: number, label = "חשמל"): RecurringRule {
  return {
    id: `rule-${day}-${label}`,
    label,
    category: "bills",
    estimatedAmount: amount,
    dayOfMonth: day,
    active: true,
    keywords: [],
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

function entry(amount: number, day: number): ExpenseEntry {
  const date = new Date(2026, 4, day).toISOString();
  return {
    id: `e-${day}-${amount}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    merchant: "test",
    createdAt: date,
  };
}

function run(args: {
  accounts?: Account[];
  incomes?: Income[];
  loans?: Loan[];
  rules?: RecurringRule[];
  entries?: ExpenseEntry[];
  monthlyBudget?: number;
}) {
  return buildCopilotInsights({
    accounts: args.accounts ?? [bank(0)],
    incomes: args.incomes ?? [],
    loans: args.loans ?? [],
    rules: args.rules ?? [],
    entries: args.entries ?? [],
    statuses: [],
    monthlyBudget: args.monthlyBudget ?? 0,
    monthKey: MONTH,
    now: NOW,
  });
}

describe("buildCopilotInsights", () => {
  it("returns no insights for a fresh empty workspace", () => {
    const insights = run({});
    expect(insights).toEqual([]);
  });

  it("warns when loan share of income is heavy", () => {
    const insights = run({
      incomes: [income(10_000, 10)],
      loans: [loan(4000, 20)],
    });
    const loanLine = insights.find((i) => i.id === "loan-share");
    expect(loanLine).toBeDefined();
    expect(loanLine?.severity).toBe("warn");
  });

  it("warns when recurring rules eat >= 50% of income", () => {
    const insights = run({
      incomes: [income(8000, 10)],
      rules: [rule(2000, 5, "rent"), rule(2200, 8, "lease")],
    });
    const r = insights.find((i) => i.id === "recurring-load");
    expect(r).toBeDefined();
    expect(r?.severity).toBe("warn");
  });

  it("surfaces salary-stabilizes when upcoming salary covers overdraft", () => {
    // anchor -8000 + salary 7000 → projected -1000, overdraft 1000,
    // salary 7000 covers easily.
    const insights = run({
      accounts: [bank(-8000)],
      incomes: [income(7000, 25)],
      loans: [],
    });
    const s = insights.find((i) => i.id === "salary-stabilizes");
    expect(s).toBeDefined();
    expect(s?.severity).toBe("watch");
  });

  it("flags a future overdraft day as danger when close", () => {
    // Anchor at 1500, big loan on day 18 = 3 days from NOW (15).
    const insights = run({
      accounts: [bank(1500)],
      loans: [loan(5000, 18)],
    });
    const o = insights.find((i) => i.id === "future-overdraft");
    expect(o).toBeDefined();
    expect(o?.severity).toBe("danger");
  });

  it("returns at most 3 insights ordered by severity", () => {
    const insights = run({
      accounts: [bank(-3000)],
      incomes: [income(8000, 25)],
      loans: [loan(4000, 26)],
      rules: [rule(3000, 28, "rent"), rule(2000, 30, "lease")],
      entries: [
        entry(2000, 5),
        entry(2500, 8),
        entry(1500, 12),
      ],
    });
    expect(insights.length).toBeLessThanOrEqual(3);
    if (insights.length >= 2) {
      const sevRank: Record<string, number> = {
        danger: 0,
        warn: 1,
        watch: 2,
        calm: 3,
        info: 4,
      };
      for (let i = 1; i < insights.length; i++) {
        expect(sevRank[insights[i].severity]).toBeGreaterThanOrEqual(
          sevRank[insights[i - 1].severity],
        );
      }
    }
  });
});
