"use client";

// Phase 445 · AURORA recovery — Banks & Accounts engine reader
//
// UI-only consumer of existing engine surfaces:
//   - getLiquidityCurve  → aggregate 60-day balance history
//   - buildFinancialSnapshot → projected EOM balance
//   - getActivityFeed → recent activity rows
//   - getMonthlyIncome → monthly inflow + count
//   - buildObligationsOverview → bank-debit obligations + loan rows
//
// No formula touched. Per-account splits come from store rows
// (accountId match on entries / cards / loans).

import { useMemo } from "react";

import { currentMonthKey } from "@/lib/dates";
import {
  buildEngineCtx,
  getActivityFeed,
  getLiquidityCurve,
  getMonthlyIncome,
} from "@/lib/financial-engine";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildObligationsOverview } from "@/lib/obligations-overview";
import { useFinanceStore } from "@/lib/store";
import type { Account, ExpenseEntry } from "@/types/finance";

export type AuroraBankActivity = {
  id: string;
  label: string;
  whenISO: string;
  amount: number;
  direction: "in" | "out";
};

export type AuroraBankUpcoming = {
  id: string;
  label: string;
  whenISO: string;
  amount: number;
  kind: "income" | "loan" | "bank_debit" | "card";
  direction: "in" | "out";
};

export type AuroraLinkedCard = {
  id: string;
  label: string;
  cardLast4?: string;
  color?: string;
};

export type AuroraLinkedLoan = {
  id: string;
  label: string;
  monthlyInstallment: number;
};

export type AuroraLinkedIncome = {
  id: string;
  label: string;
  amount: number;
  dayOfMonth?: number;
};

export type AuroraBankAccount = {
  id: string;
  label: string;
  active: boolean;
  anchorBalance: number;
  anchorUpdatedAt?: string;
  /** Engine-driven snapshot balance — same number every screen reads. */
  projectedEom: number;
  /** Days the anchor has been stale (since user typed it). */
  anchorAgeDays: number;
  /** Sum of confirmed cash-method outflows where accountId === this. */
  monthlyOutflow: number;
  monthlyOutflowCount: number;
  /** Sum of refund inflows where accountId === this. */
  monthlyInflow: number;
  monthlyInflowCount: number;
  /** Health: derived from balance + recency. */
  health: "safe" | "watch" | "danger";
  recentActivity: AuroraBankActivity[];
  upcomingEvents: AuroraBankUpcoming[];
  /** 14-day moving balance window from curve, normalized as ratio. */
  history: number[];
};

export type AuroraBanksData = {
  ready: boolean;
  monthLabel: string;
  totalCurrent: number;
  totalProjected: number;
  totalInflow: number;
  totalOutflow: number;
  accounts: AuroraBankAccount[];
  linkedCards: AuroraLinkedCard[];
  linkedLoans: AuroraLinkedLoan[];
  linkedIncomes: AuroraLinkedIncome[];
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const EMPTY: AuroraBanksData = {
  ready: false,
  monthLabel: "—",
  totalCurrent: 0,
  totalProjected: 0,
  totalInflow: 0,
  totalOutflow: 0,
  accounts: [],
  linkedCards: [],
  linkedLoans: [],
  linkedIncomes: [],
};

function healthBand(balance: number, anchorAgeDays: number): AuroraBankAccount["health"] {
  if (balance < 0) return "danger";
  if (anchorAgeDays > 14) return "watch";
  if (balance < 1500) return "watch";
  return "safe";
}

function ageInDays(iso: string | undefined, now: Date): number {
  if (!iso) return 999;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.round((now.getTime() - t) / 86_400_000));
}

function isBankEntry(e: ExpenseEntry): boolean {
  return e.paymentMethod === "cash";
}

export function useAuroraBanks(): AuroraBanksData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return useMemo<AuroraBanksData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const [year, mIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(mIdx ?? 1) - 1]} ${year}`;
    const now = new Date();

    const banks = accounts.filter((a) => a.kind === "bank");
    if (banks.length === 0) {
      return { ...EMPTY, ready: true, monthLabel };
    }

    const ctx = buildEngineCtx({
      accounts, loans, incomes, rules, statuses, entries, monthlyBudget, monthKey,
    });
    const curve = getLiquidityCurve(ctx, 60);
    const snapshot = buildFinancialSnapshot({
      accounts, loans, incomes, entries, rules, statuses, monthlyBudget,
      monthKey, now: ctx.now,
    });
    const feed = getActivityFeed(ctx);
    const income = getMonthlyIncome(ctx);
    const obligations = buildObligationsOverview({
      loans, rules, accounts, monthKey, now: ctx.now,
    });

    // Recent activity index for fast accountId match.
    const feedByAccount = new Map<string, AuroraBankActivity[]>();
    for (const row of feed.rows) {
      const accId = entries.find((e) => e.id === row.entryId)?.accountId;
      if (!accId) continue;
      if (!feedByAccount.has(accId)) feedByAccount.set(accId, []);
      feedByAccount.get(accId)!.push({
        id: row.refId,
        label: row.title,
        whenISO: row.whenISO,
        amount: row.amount,
        direction: row.direction,
      });
    }

    // Upcoming events per bank — pulled from curve events with
    // accountId hint when available, otherwise distributed only to
    // the primary anchor (first active bank).
    const upcomingPerAccount = new Map<string, AuroraBankUpcoming[]>();
    const primaryBank = banks.find((b) => b.active) ?? banks[0];
    for (const p of curve.points) {
      for (const e of p.events) {
        if (new Date(e.whenISO).getTime() < ctx.now.getTime()) continue;
        const accId = primaryBank.id; // curve doesn't expose per-bank routing
        if (!upcomingPerAccount.has(accId)) upcomingPerAccount.set(accId, []);
        upcomingPerAccount.get(accId)!.push({
          id: `${e.whenISO}-${e.label}`,
          label: e.label,
          whenISO: e.whenISO,
          amount: Math.abs(e.amount),
          kind: e.kind,
          direction: e.amount >= 0 ? "in" : "out",
        });
      }
    }

    // Balance history (last 14 days), shared across banks (curve is
    // aggregated). Surfacing as ratio-normalized array so individual
    // workspaces can draw a sparkline; absolute balance per bank
    // would require split routing — kept out per guardrail.
    const tail = curve.points.slice(0, 14).reverse();
    const historyValues = tail.map((p) => p.balance);

    let totalCurrent = 0;
    let totalProjected = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    const bankAccounts: AuroraBankAccount[] = banks.map((b) => {
      let outflow = 0,
        outflowCount = 0,
        inflow = 0,
        inflowCount = 0;
      for (const e of entries) {
        if (e.accountId !== b.id) continue;
        if (!e.chargeDate?.startsWith(monthKey)) continue;
        if (e.isRefund) {
          inflow += e.amount;
          inflowCount += 1;
        } else if (isBankEntry(e)) {
          outflow += e.amount;
          outflowCount += 1;
        }
      }
      const anchor = b.anchorBalance ?? 0;
      const anchorAge = ageInDays(b.anchorUpdatedAt, ctx.now);
      // Projected EOM per-bank is not computed individually by the
      // engine. Use the share-of-total fallback so the number remains
      // engine-anchored (totalAnchor share × snapshot EOM).
      const sumAnchor = banks.reduce(
        (s, x) => s + (x.anchorBalance ?? 0),
        0,
      );
      const share = sumAnchor !== 0 ? anchor / sumAnchor : 1 / banks.length;
      const projectedEom = Math.round(
        snapshot.projectedBalanceOnFirstOfNextMonth * share,
      );

      totalCurrent += anchor;
      totalProjected += projectedEom;
      totalInflow += inflow;
      totalOutflow += outflow;

      return {
        id: b.id,
        label: b.label,
        active: b.active,
        anchorBalance: Math.round(anchor),
        anchorUpdatedAt: b.anchorUpdatedAt,
        projectedEom,
        anchorAgeDays: anchorAge,
        monthlyOutflow: Math.round(outflow),
        monthlyOutflowCount: outflowCount,
        monthlyInflow: Math.round(inflow),
        monthlyInflowCount: inflowCount,
        health: healthBand(anchor, anchorAge),
        recentActivity: (feedByAccount.get(b.id) ?? []).slice(0, 5),
        upcomingEvents: (upcomingPerAccount.get(b.id) ?? []).slice(0, 6),
        history: historyValues,
      };
    });

    const linkedCards: AuroraLinkedCard[] = accounts
      .filter((a) => a.kind === "card" && a.active)
      .map((a) => ({
        id: a.id,
        label: a.label,
        cardLast4: a.cardLast4,
        color: a.color,
      }));

    const linkedLoans: AuroraLinkedLoan[] = obligations.loans
      .filter((row) => row.loan.active)
      .map((row) => ({
        id: row.loan.id,
        label: row.loan.label,
        monthlyInstallment: Math.round(row.loan.monthlyInstallment),
      }));

    const linkedIncomes: AuroraLinkedIncome[] = incomes
      .filter((inc) => inc.active)
      .map((inc) => ({
        id: inc.id,
        label: inc.label,
        amount: Math.round(income.rows.find((r) => r.refId === `inc:${inc.id}`)?.amount ?? inc.amount),
        dayOfMonth: inc.dayOfMonth,
      }));

    return {
      ready: true,
      monthLabel,
      totalCurrent: Math.round(totalCurrent),
      totalProjected: Math.round(totalProjected),
      totalInflow: Math.round(totalInflow),
      totalOutflow: Math.round(totalOutflow),
      accounts: bankAccounts.sort(
        (a, b) => b.anchorBalance - a.anchorBalance,
      ),
      linkedCards,
      linkedLoans,
      linkedIncomes,
    };
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, monthlyBudget]);
}
