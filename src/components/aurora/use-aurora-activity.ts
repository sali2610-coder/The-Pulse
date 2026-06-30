"use client";

// Phase 433 · AURORA v1 — useAuroraActivity
//
// Full activity feed for the Activity / Transactions screen.
// Composes the same engine surface the Home hook uses but returns
// the full month (not just 6 rows) plus filter / search / grouping
// helpers. Falls through to a richer demo fixture when the store is
// cold so /aurora-preview always feels alive.

import { useMemo } from "react";

import { currentMonthKey } from "@/lib/dates";
import {
  buildEngineCtx,
  getActivityFeed,
  type ActivityFeedRow,
} from "@/lib/financial-engine";
import { useFinanceStore } from "@/lib/store";

import { DEMO_AURORA_HOME } from "./aurora-demo-data";

export type AuroraActivityFilter = "all" | "out" | "in" | "refund" | "pending";

export type AuroraActivityItem = {
  id: string;
  entryId?: string;
  label: string;
  category: string;
  amount: number;
  whenISO: string;
  direction: "in" | "out";
  isWithdrawal: boolean;
  isRefund: boolean;
  bankPending: boolean;
  needsConfirmation: boolean;
  source: "manual" | "auto" | "sms" | "wallet" | "demo";
  paySource: "income" | "credit" | "cash" | "bank" | "wallet";
  installments: number;
};

export type AuroraActivityDay = {
  dayISO: string;
  label: string;
  totalOut: number;
  totalIn: number;
  rows: AuroraActivityItem[];
};

export type AuroraActivityData = {
  ready: boolean;
  isDemo: boolean;
  monthLabel: string;
  totalOut: number;
  totalIn: number;
  count: number;
  items: AuroraActivityItem[];
  days: AuroraActivityDay[];
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromFeedRow(r: ActivityFeedRow): AuroraActivityItem {
  return {
    id: r.entryId ?? r.refId,
    entryId: r.entryId,
    label: r.title,
    category: r.category,
    amount: r.amount,
    whenISO: r.whenISO,
    direction: r.direction,
    isWithdrawal: r.isWithdrawal,
    isRefund: r.isRefund,
    bankPending: r.bankPending,
    needsConfirmation: r.needsConfirmation,
    source: r.source,
    paySource: r.paySource,
    installments: r.installments,
  };
}

function fromDemoRecent(): AuroraActivityItem[] {
  return DEMO_AURORA_HOME.recentActivity.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    label: r.label,
    category: r.category ?? "other",
    amount: r.amount,
    whenISO: r.whenISO,
    direction: r.direction,
    isWithdrawal: r.isWithdrawal,
    isRefund: r.isRefund,
    bankPending: false,
    needsConfirmation: false,
    source: "demo",
    paySource: r.direction === "in" ? "income" : "credit",
    installments: 1,
  }));
}

function buildDays(items: AuroraActivityItem[]): AuroraActivityDay[] {
  const map = new Map<string, AuroraActivityDay>();
  for (const it of items) {
    const key = dayKeyOf(it.whenISO);
    if (!map.has(key)) {
      map.set(key, {
        dayISO: key,
        label: DAY_FMT.format(new Date(it.whenISO)),
        totalOut: 0,
        totalIn: 0,
        rows: [],
      });
    }
    const day = map.get(key)!;
    day.rows.push(it);
    if (it.direction === "out") day.totalOut += it.amount;
    else day.totalIn += it.amount;
  }
  return Array.from(map.values()).sort((a, b) => (a.dayISO < b.dayISO ? 1 : -1));
}

export function applyFilter(
  items: AuroraActivityItem[],
  filter: AuroraActivityFilter,
  query: string,
): AuroraActivityItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (filter === "out" && it.direction !== "out") return false;
    if (filter === "in" && it.direction !== "in") return false;
    if (filter === "refund" && !it.isRefund) return false;
    if (filter === "pending" && !(it.bankPending || it.needsConfirmation))
      return false;
    if (q.length > 0) {
      const hay = `${it.label} ${it.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function useAuroraActivity(): AuroraActivityData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraActivityData>(() => {
    const monthKey = currentMonthKey();
    const [year, monthIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(monthIdx ?? 1) - 1]} ${year}`;

    if (!hydrated) {
      return {
        ready: false,
        isDemo: false,
        monthLabel,
        totalOut: 0,
        totalIn: 0,
        count: 0,
        items: [],
        days: [],
      };
    }

    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    if (!hasAnyAnchor && entries.length === 0 && loans.length === 0) {
      const items = fromDemoRecent();
      const totalOut = items.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0);
      const totalIn = items.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0);
      return {
        ready: true,
        isDemo: true,
        monthLabel,
        totalOut,
        totalIn,
        count: items.length,
        items,
        days: buildDays(items),
      };
    }

    const ctx = buildEngineCtx({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey,
    });
    const feed = getActivityFeed(ctx);
    const items = feed.rows.map(fromFeedRow);
    const totalOut = items.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0);
    const totalIn = items.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0);
    return {
      ready: true,
      isDemo: false,
      monthLabel,
      totalOut,
      totalIn,
      count: items.length,
      items,
      days: buildDays(items),
    };
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}
