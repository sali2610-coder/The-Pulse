"use client";

// Phase 201 — Account Bridge card.
//
// Trust-layer rewrite. Splits the bridge into two visually distinct
// halves so the user instantly separates fact from forecast:
//
//   1. "המצב כעת" — current reality
//        • bank balance (anchors)
//        • spent already this month (informational)
//   2. "צפוי עוד החודש" — predicted remaining
//        • expected income still to land
//        • pending obligations breakdown
//   3. emphasized final line "יתרה צפויה אחרי הכל"
//
// All numbers come from accountBridge (no math drift). Adds:
//   * explain sheet
//   * confidence chip
//   * data-freshness stamp
//   * graceful empty state when no anchors are set

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarClock,
  CreditCard,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { accountBridge } from "@/lib/account-bridge";
import { explainAccountBridge } from "@/lib/explainability";
import { confidenceForBridge } from "@/lib/confidence";
import { dataFreshness } from "@/lib/data-freshness";
import { SectionHeader } from "@/components/ui/section-header";
import { ExplainSheet } from "@/components/ui/explain-sheet";
import { ConfidenceChip } from "@/components/ui/confidence-chip";
import { DataFreshnessStamp } from "@/components/ui/data-freshness-stamp";
import { CardEmpty } from "@/components/ui/card-empty";
import { listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(n))}`;
}

type Row = {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "pos" | "neg" | "neutral";
  signedDisplay?: boolean;
};

export function AccountBridgeCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const lastSyncedAt = useFinanceStore((s) => s.lastSyncedAt);

  const bridge = useMemo(() => {
    if (!hydrated) return null;
    return accountBridge({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  const confidence = useMemo(
    () =>
      hydrated
        ? confidenceForBridge({ accounts, incomes, loans, rules })
        : null,
    [hydrated, accounts, incomes, loans, rules],
  );

  const freshness = useMemo(
    () =>
      hydrated
        ? dataFreshness({
            entries,
            rules,
            loans,
            incomes,
            lastSyncedAt,
          })
        : null,
    [hydrated, entries, rules, loans, incomes, lastSyncedAt],
  );

  if (!hydrated || !bridge) return null;
  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Activity />} title="מצב חשבון מול הוצאות" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="חסר עוגן יתרת בנק"
          reason="בלי יתרת בנק עדכנית, אי אפשר להראות את הגשר בין המצב הנוכחי להתחייבויות."
          unlockHint="פתח הגדרות → חשבונות → הוסף חשבון בנק עם יתרה נוכחית."
        />
      </section>
    );
  }

  const realityRows: Row[] = [
    {
      icon: <Banknote className="size-3" />,
      label: "יתרה נוכחית בבנק",
      value: bridge.currentBankBalance,
      tone: bridge.currentBankBalance < 0 ? "neg" : "neutral",
      signedDisplay: true,
    },
    {
      icon: <ArrowDown className="size-3" />,
      label: "הוצאות מתחילת החודש",
      value: bridge.spentThisMonth,
      tone: "neg",
    },
  ];

  const forecastRows: Row[] = [
    {
      icon: <ArrowUp className="size-3" />,
      label: "הכנסות שעוד יגיעו",
      value: bridge.expectedIncomeRemaining,
      tone: "pos",
    },
    {
      icon: <ReceiptText className="size-3" />,
      label: "הוצאות קבועות צפויות",
      value: bridge.pendingFixed,
      tone: "neg",
    },
    {
      icon: <CalendarClock className="size-3" />,
      label: "הלוואות שעוד ירדו",
      value: bridge.pendingLoans,
      tone: "neg",
    },
    {
      icon: <CreditCard className="size-3" />,
      label: "חיובי כרטיס צפויים",
      value: bridge.pendingCardCharges,
      tone: "neg",
    },
  ];

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <SectionHeader
        icon={<Activity />}
        title="מצב חשבון מול הוצאות"
        trailing={
          <div className="flex items-center gap-1">
            {confidence ? <ConfidenceChip level={confidence.level} /> : null}
            <ExplainSheet
              explanation={explainAccountBridge(bridge)}
              confidence={confidence ?? undefined}
            />
          </div>
        }
      />

      <Group label="המצב כעת" tone="fact">
        {realityRows.map((r, idx) => (
          <BridgeRow key={r.label} {...r} index={idx} />
        ))}
      </Group>

      <Group label="צפוי עוד החודש" tone="forecast">
        {forecastRows.map((r, idx) => (
          <BridgeRow key={r.label} {...r} index={idx} />
        ))}
      </Group>

      <div className="flex items-center justify-between rounded-2xl border border-[color:var(--neon)]/30 bg-[color:var(--neon)]/10 p-3">
        <span className="flex items-center gap-1.5 text-[12px] text-[color:var(--neon)]">
          <Wallet className="size-3" />
          יתרה צפויה אחרי הכל
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[18px] font-medium"
          style={{
            color:
              bridge.expectedBalanceAfterAllObligations < 0
                ? "#F87171"
                : "#34D399",
          }}
        >
          {signed(bridge.expectedBalanceAfterAllObligations)}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        ההוצאות שכבר נכנסו כבר משוקפות ביתרת הבנק — לא מקוזזות שנית. חיוב
        בפלאן נספר פעם אחת.
      </p>

      {freshness ? <DataFreshnessStamp freshness={freshness} /> : null}
    </section>
  );
}

function Group({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "fact" | "forecast";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] ${
            tone === "fact"
              ? "bg-[#34D399]/10 text-[#34D399]"
              : "bg-gold/10 text-gold"
          }`}
        >
          {tone === "fact" ? "נתון בפועל" : "תחזית"}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function BridgeRow({
  icon,
  label,
  value,
  tone,
  index,
  signedDisplay,
}: Row & { index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      className="flex items-center justify-between gap-2 py-0.5"
    >
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="text-[color:var(--neon)]/80">{icon}</span>
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12.5px] font-medium"
        style={{
          color:
            tone === "neg" ? "#F87171" : tone === "pos" ? "#34D399" : undefined,
        }}
      >
        {signedDisplay ? signed(value) : ILS.format(value)}
      </span>
    </motion.li>
  );
}
