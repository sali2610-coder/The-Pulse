"use client";

// Phase 201 — Expected Balance card.
//
// Trust-layer rewrite. Visualises the forecast as a vertical chain
// the user can read top-down:
//
//   Current balance
//      ↓
//   + Expected income remaining
//      ↓
//   − Pending fixed
//      ↓
//   − Pending loans
//      ↓
//   − Pending card charges
//      =
//   Projected end-of-month balance
//
// Same numbers accountBridge already provides — no math drift.
// Adds explain sheet, confidence chip, premium empty state.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  CalendarClock,
  CreditCard,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { accountBridge } from "@/lib/account-bridge";
import { explainAccountBridge } from "@/lib/explainability";
import { confidenceForBridge } from "@/lib/confidence";
import { SectionHeader } from "@/components/ui/section-header";
import { ExplainSheet } from "@/components/ui/explain-sheet";
import { ConfidenceChip } from "@/components/ui/confidence-chip";
import { CardEmpty } from "@/components/ui/card-empty";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const s = n > 0 ? "+" : "−";
  return `${s}${ILS.format(Math.abs(n))}`;
}

export function ExpectedBalanceCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

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

  if (!hydrated || !bridge) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Wallet />} title="יתרה צפויה אחרי כל ההתחייבויות" />
        <CardEmpty
          icon={<Landmark className="size-4" />}
          title="חסרה יתרת בנק נוכחית"
          reason="התחזית מתחילה מהיתרה שאתה מזין. בלי עוגן בנק אין נקודת ייחוס."
          unlockHint="הוסף חשבון בנק והכנס יתרה נוכחית מתוך הגדרות → חשבונות."
        />
      </section>
    );
  }

  const final = bridge.expectedBalanceAfterAllObligations;
  const finalColor = final < 0 ? "#F87171" : "#34D399";

  const chain: Array<{
    icon: React.ReactNode;
    label: string;
    amount: number;
    tone: "pos" | "neg" | "neutral";
  }> = [
    {
      icon: <Landmark className="size-3" />,
      label: "יתרה נוכחית",
      amount: bridge.currentBankBalance,
      tone: bridge.currentBankBalance < 0 ? "neg" : "neutral",
    },
    {
      icon: <Wallet className="size-3" />,
      label: "הכנסות שעוד יגיעו",
      amount: bridge.expectedIncomeRemaining,
      tone: "pos",
    },
    {
      icon: <ReceiptText className="size-3" />,
      label: "הוצאות קבועות שעוד צפויות",
      amount: -bridge.pendingFixed,
      tone: "neg",
    },
    {
      icon: <CalendarClock className="size-3" />,
      label: "הלוואות החודש שעוד ירדו",
      amount: -bridge.pendingLoans,
      tone: "neg",
    },
    {
      icon: <CreditCard className="size-3" />,
      label: "חיובי כרטיס שעוד צפויים",
      amount: -bridge.pendingCardCharges,
      tone: "neg",
    },
  ];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Wallet />}
        title="יתרה צפויה אחרי כל ההתחייבויות"
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

      <div className="flex items-baseline justify-between gap-2">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[28px] font-light leading-none"
          style={{ color: finalColor }}
        >
          <AnimatedCounter value={final} format={(v) => signed(v)} />
        </span>
        <span className="text-[10px] text-muted-foreground/80">סוף החודש</span>
      </div>

      <ol className="flex flex-col gap-1 border-t border-white/8 pt-2">
        {chain.map((row, idx) => (
          <ChainRow key={row.label} {...row} index={idx} />
        ))}
      </ol>

      <p className="text-[10px] text-muted-foreground/80">
        החישוב כולל את כל החיובים שעוד צפויים לרדת החודש, גם אם יום החיוב
        בתאריך עתידי. תשלומי כרטיס מקושרים לכרטיס נספרים פעם אחת בלבד.
      </p>
    </section>
  );
}

function ChainRow({
  icon,
  label,
  amount,
  tone,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  tone: "pos" | "neg" | "neutral";
  index: number;
}) {
  const color =
    tone === "neg" ? "#F87171" : tone === "pos" ? "#34D399" : undefined;
  return (
    <motion.li
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      className="flex items-center justify-between gap-2"
    >
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {index > 0 ? <ArrowDown className="size-2.5 text-white/30" aria-hidden /> : null}
        <span className="text-[color:var(--neon)]/80">{icon}</span>
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12.5px]"
        style={{ color }}
      >
        {signed(amount)}
      </span>
    </motion.li>
  );
}
