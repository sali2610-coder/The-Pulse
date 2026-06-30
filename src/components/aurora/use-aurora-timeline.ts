"use client";

// Phase 436 · AURORA v1 — useAuroraTimeline
//
// Unified vertical timeline for Pulse. Composes two ENGINE surfaces
// — getActivityFeed (past entries, current month window) and
// getLiquidityCurve (future events) — without touching either of
// them. UI-only consumer; financial behavior unchanged.
//
// Returns past + future items as a single shape (AuroraTimelineItem)
// so the Timeline screen renders one scrollable, day-grouped list.

import { useMemo } from "react";

import { currentMonthKey } from "@/lib/dates";
import {
  buildEngineCtx,
  getActivityFeed,
  getLiquidityCurve,
} from "@/lib/financial-engine";
import type { LiquidityEventKind } from "@/lib/liquidity-curve";
import { useFinanceStore } from "@/lib/store";

import { DEMO_AURORA_HOME } from "./aurora-demo-data";

export type AuroraTimelineDirection = "in" | "out";

export type AuroraTimelineItem = {
  id: string;
  /** When this item lives on the timeline. */
  whenISO: string;
  /** Where it falls relative to now. */
  bucket: "past" | "today" | "future";
  /** Past = recorded transaction. Future = projected event. */
  origin: "entry" | "projection";
  label: string;
  amount: number;
  direction: AuroraTimelineDirection;
  category?: string;
  /** Only present when origin === "entry"; lets the row open the
   *  edit/delete sheet against the real store row. */
  entryId?: string;
  /** Only present for projection rows. */
  projectionKind?: LiquidityEventKind;
  accountId?: string;
  cardLast4?: string;
  isRefund: boolean;
  isWithdrawal: boolean;
  bankPending: boolean;
  needsConfirmation: boolean;
  installments: number;
  paySource: "income" | "credit" | "cash" | "bank" | "wallet";
  source: "manual" | "auto" | "sms" | "wallet" | "projection" | "demo";
};

export type AuroraTimelineDay = {
  dayISO: string;
  label: string;
  totalOut: number;
  totalIn: number;
  bucket: "past" | "today" | "future";
  rows: AuroraTimelineItem[];
};

export type AuroraTimelineData = {
  ready: boolean;
  isDemo: boolean;
  monthLabel: string;
  past: AuroraTimelineDay[];
  future: AuroraTimelineDay[];
  totals: {
    pastIn: number;
    pastOut: number;
    futureIn: number;
    futureOut: number;
  };
};

export type AuroraTimelineFilters = {
  query: string;
  range: "all" | "past" | "future";
  direction: "all" | "in" | "out";
  category: string;
  account: string;
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

function bucketOf(iso: string, now: Date): "past" | "today" | "future" {
  const t = new Date(iso);
  const sameDay =
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate();
  if (sameDay) return "today";
  return t.getTime() < now.getTime() ? "past" : "future";
}

function groupDays(
  items: AuroraTimelineItem[],
  direction: "asc" | "desc",
): AuroraTimelineDay[] {
  const map = new Map<string, AuroraTimelineDay>();
  for (const it of items) {
    const key = dayKeyOf(it.whenISO);
    if (!map.has(key)) {
      map.set(key, {
        dayISO: key,
        label: DAY_FMT.format(new Date(it.whenISO)),
        totalOut: 0,
        totalIn: 0,
        bucket: it.bucket,
        rows: [],
      });
    }
    const day = map.get(key)!;
    day.rows.push(it);
    if (it.direction === "out") day.totalOut += it.amount;
    else day.totalIn += it.amount;
  }
  const sorted = Array.from(map.values()).sort((a, b) =>
    direction === "asc" ? (a.dayISO < b.dayISO ? -1 : 1) : a.dayISO < b.dayISO ? 1 : -1,
  );
  return sorted;
}

function fromDemoTimeline(now: Date): AuroraTimelineItem[] {
  const items: AuroraTimelineItem[] = [];
  // Past = recent demo activity.
  for (const r of DEMO_AURORA_HOME.recentActivity) {
    items.push({
      id: r.id,
      whenISO: r.whenISO,
      bucket: bucketOf(r.whenISO, now),
      origin: "entry",
      label: r.label,
      amount: r.amount,
      direction: r.direction,
      category: r.category ?? "other",
      isRefund: r.isRefund,
      isWithdrawal: r.isWithdrawal,
      bankPending: false,
      needsConfirmation: false,
      installments: 1,
      paySource: r.direction === "in" ? "income" : "credit",
      source: "demo",
    });
  }
  // Future = upcoming fortnight projections.
  for (const e of DEMO_AURORA_HOME.upcomingFortnight) {
    items.push({
      id: `demo-proj-${e.whenISO}-${e.label}`,
      whenISO: e.whenISO,
      bucket: "future",
      origin: "projection",
      label: e.label,
      amount: e.amount,
      direction: e.kind === "income" ? "in" : "out",
      projectionKind: e.kind,
      isRefund: false,
      isWithdrawal: false,
      bankPending: false,
      needsConfirmation: false,
      installments: 1,
      paySource: e.kind === "income" ? "income" : "credit",
      source: "demo",
    });
  }
  return items;
}

export function useAuroraTimeline(): AuroraTimelineData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraTimelineData>(() => {
    const monthKey = currentMonthKey();
    const [year, monthIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(monthIdx ?? 1) - 1]} ${year}`;

    if (!hydrated) {
      return {
        ready: false,
        isDemo: false,
        monthLabel,
        past: [],
        future: [],
        totals: { pastIn: 0, pastOut: 0, futureIn: 0, futureOut: 0 },
      };
    }

    const hasAnyAnchor = accounts.some(
      (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
    );
    const now = new Date();
    if (!hasAnyAnchor && entries.length === 0 && loans.length === 0) {
      const items = fromDemoTimeline(now);
      const pastItems = items.filter((i) => i.bucket !== "future");
      const futureItems = items.filter((i) => i.bucket !== "past");
      return {
        ready: true,
        isDemo: true,
        monthLabel,
        past: groupDays(pastItems, "desc"),
        future: groupDays(futureItems, "asc"),
        totals: {
          pastIn: pastItems.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0),
          pastOut: pastItems.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0),
          futureIn: futureItems.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0),
          futureOut: futureItems.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0),
        },
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
    const curve = getLiquidityCurve(ctx, 35);

    const items: AuroraTimelineItem[] = [];
    for (const r of feed.rows) {
      items.push({
        id: r.entryId ?? r.refId,
        whenISO: r.whenISO,
        bucket: bucketOf(r.whenISO, ctx.now),
        origin: "entry",
        label: r.title,
        amount: r.amount,
        direction: r.direction,
        category: r.category,
        entryId: r.entryId,
        cardLast4: r.cardLast4,
        isRefund: r.isRefund,
        isWithdrawal: r.isWithdrawal,
        bankPending: r.bankPending,
        needsConfirmation: r.needsConfirmation,
        installments: r.installments,
        paySource: r.paySource,
        source: r.source,
      });
    }
    for (const p of curve.points) {
      for (const e of p.events) {
        const when = new Date(e.whenISO);
        if (when.getTime() < ctx.now.getTime()) continue;
        items.push({
          id: `proj-${e.whenISO}-${e.label}`,
          whenISO: e.whenISO,
          bucket: bucketOf(e.whenISO, ctx.now),
          origin: "projection",
          label: e.label,
          amount: Math.abs(e.amount),
          direction: e.amount >= 0 ? "in" : "out",
          projectionKind: e.kind,
          cardLast4: e.cardLabel,
          isRefund: false,
          isWithdrawal: false,
          bankPending: false,
          needsConfirmation: false,
          installments: 1,
          paySource: e.kind === "income" ? "income" : e.kind === "card" ? "credit" : "bank",
          source: "projection",
        });
      }
    }

    const pastItems = items.filter((i) => i.bucket !== "future");
    const futureItems = items.filter((i) => i.bucket !== "past");
    return {
      ready: true,
      isDemo: false,
      monthLabel,
      past: groupDays(pastItems, "desc"),
      future: groupDays(futureItems, "asc"),
      totals: {
        pastIn: pastItems.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0),
        pastOut: pastItems.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0),
        futureIn: futureItems.filter((i) => i.direction === "in").reduce((s, i) => s + i.amount, 0),
        futureOut: futureItems.filter((i) => i.direction === "out").reduce((s, i) => s + i.amount, 0),
      },
    };
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}

export function filterTimeline(
  items: AuroraTimelineItem[],
  f: AuroraTimelineFilters,
): AuroraTimelineItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((it) => {
    if (f.range === "past" && it.bucket === "future") return false;
    if (f.range === "future" && it.bucket === "past") return false;
    if (f.direction !== "all" && it.direction !== f.direction) return false;
    if (f.category !== "all" && it.category !== f.category) return false;
    if (f.account !== "all" && it.accountId !== f.account && it.cardLast4 !== f.account)
      return false;
    if (q.length > 0) {
      const hay = `${it.label} ${it.category ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
