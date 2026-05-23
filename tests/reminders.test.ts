import { describe, expect, it } from "vitest";

import { evaluateReminders } from "@/lib/reminders";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const NOW = new Date("2026-05-15T08:00:00.000Z");

function bankAccount(opts: Partial<Account> = {}): Account {
  return {
    id: "acc-bank",
    kind: "bank",
    label: "Hapoalim",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    anchorBalance: 12000,
    anchorUpdatedAt: NOW.toISOString(),
    ...opts,
  };
}

function cardAccount(opts: Partial<Account> = {}): Account {
  return {
    id: "acc-card",
    kind: "card",
    label: "CAL",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    cardLast4: "1234",
    creditLimit: 10000,
    ...opts,
  };
}

function rule(opts: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "rule-1",
    label: "Rent",
    category: "bills",
    estimatedAmount: 5000,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

function entry(opts: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e-1",
    amount: 100,
    installments: 1,
    chargeDate: NOW.toISOString(),
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    createdAt: NOW.toISOString(),
    ...opts,
  };
}

describe("evaluateReminders", () => {
  it("returns empty list when nothing is due", () => {
    const out = evaluateReminders({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("fires unpaid_recurring when rule day is in the past with no paid status", () => {
    const out = evaluateReminders({
      entries: [],
      rules: [rule({ dayOfMonth: 5 })],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    const r = out.find((r) => r.kind === "unpaid_recurring");
    expect(r).toBeDefined();
    expect(r?.severity).toBe("warn");
    expect(r?.key).toBe("unpaid_recurring:rule-1:2026-05");
  });

  it("suppresses unpaid_recurring when a paid status exists", () => {
    const r = rule({ dayOfMonth: 5 });
    const status: RecurringStatus = {
      ruleId: r.id,
      monthKey: "2026-05",
      status: "paid",
    };
    const out = evaluateReminders({
      entries: [],
      rules: [r],
      statuses: [status],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(out.filter((x) => x.kind === "unpaid_recurring")).toHaveLength(0);
  });

  it("suppresses unpaid_recurring when day is in the future", () => {
    const out = evaluateReminders({
      entries: [],
      rules: [rule({ dayOfMonth: 28 })],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(out.filter((x) => x.kind === "unpaid_recurring")).toHaveLength(0);
  });

  it("fires high_card_pressure once usage crosses threshold", () => {
    const card = cardAccount({ creditLimit: 1000 });
    const onCardRule = rule({
      id: "rule-card",
      label: "Sub",
      paymentSource: "card",
      linkedCardId: card.id,
      estimatedAmount: 800,
      dayOfMonth: 1,
    });
    const out = evaluateReminders({
      entries: [],
      rules: [onCardRule],
      statuses: [],
      accounts: [card],
      monthlyBudget: 0,
      now: NOW,
    });
    const cp = out.find((r) => r.kind === "high_card_pressure");
    expect(cp).toBeDefined();
    expect(cp?.severity).toBe("warn"); // 800/1000 = 0.8 < 1
  });

  it("escalates high_card_pressure to critical past 100%", () => {
    const card = cardAccount({ creditLimit: 500 });
    const onCardRule = rule({
      id: "rule-card",
      label: "Sub",
      paymentSource: "card",
      linkedCardId: card.id,
      estimatedAmount: 800,
      dayOfMonth: 1,
    });
    const out = evaluateReminders({
      entries: [],
      rules: [onCardRule],
      statuses: [],
      accounts: [card],
      monthlyBudget: 0,
      now: NOW,
    });
    const cp = out.find((r) => r.kind === "high_card_pressure");
    expect(cp?.severity).toBe("critical");
  });

  it("fires budget_approaching at the configured ratio", () => {
    const out = evaluateReminders({
      entries: [entry({ amount: 8600, chargeDate: NOW.toISOString() })],
      rules: [],
      statuses: [],
      accounts: [],
      monthlyBudget: 10000,
      now: NOW,
    });
    const b = out.find((r) => r.kind === "budget_approaching");
    expect(b).toBeDefined();
  });

  it("fires stale_anchor for old anchor updates", () => {
    const stale = bankAccount({
      anchorUpdatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    });
    const out = evaluateReminders({
      entries: [],
      rules: [],
      statuses: [],
      accounts: [stale],
      monthlyBudget: 0,
      now: NOW,
    });
    const s = out.find((r) => r.kind === "stale_anchor");
    expect(s).toBeDefined();
    expect(s?.source.entityId).toBe(stale.id);
  });

  it("keys are deterministic + month-scoped (idempotent dispatch)", () => {
    const r = rule({ dayOfMonth: 5 });
    const a = evaluateReminders({
      entries: [],
      rules: [r],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    const b = evaluateReminders({
      entries: [],
      rules: [r],
      statuses: [],
      accounts: [],
      monthlyBudget: 0,
      now: NOW,
    });
    expect(a[0].key).toBe(b[0].key);
  });
});
