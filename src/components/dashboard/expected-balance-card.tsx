"use client";

// "יתרה צפויה אחרי כל ההתחייבויות" — single-glance financial
// horizon. The breakdown is dedicated rows so the user sees exactly
// what was subtracted. Math itself is reused from accountBridge so
// no number ever drifts from the bridge card next to it.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CreditCard,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { accountBridge } from "@/lib/account-bridge";
import { SectionHeader } from "@/components/ui/section-header";
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

  if (!hydrated || !bridge) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) return null;

  const final = bridge.expectedBalanceAfterAllObligations;
  const finalColor = final < 0 ? "#F87171" : "#34D399";

  const rows = [
    {
      icon: <Landmark className="size-3" />,
      label: "יתרה נוכחית",
      value: bridge.currentBankBalance,
      tone: bridge.currentBankBalance < 0 ? "neg" : "pos",
    },
    {
      icon: <Wallet className="size-3" />,
      label: "הכנסות שעוד יגיעו",
      value: bridge.expectedIncomeRemaining,
      tone: "pos",
    },
    {
      icon: <ReceiptText className="size-3" />,
      label: "הוצאות קבועות שעוד צפויות",
      value: -bridge.pendingFixed,
      tone: "neg",
    },
    {
      icon: <CalendarClock className="size-3" />,
      label: "הלוואות החודש שעוד ירדו",
      value: -bridge.pendingLoans,
      tone: "neg",
    },
    {
      icon: <CreditCard className="size-3" />,
      label: "חיובי כרטיס שעוד צפויים",
      value: -bridge.pendingCardCharges,
      tone: "neg",
    },
  ];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Wallet />}
        title="יתרה צפויה אחרי כל ההתחייבויות"
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

      <ul className="flex flex-col gap-1 border-t border-white/8 pt-2">
        {rows.map((r, idx) => (
          <motion.li
            key={r.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listReveal(idx)}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="text-[color:var(--neon)]/80">{r.icon}</span>
              {r.label}
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[12.5px]"
              style={{
                color:
                  r.tone === "neg"
                    ? "#F87171"
                    : r.tone === "pos"
                      ? "#34D399"
                      : undefined,
              }}
            >
              {signed(r.value)}
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground/80">
        החישוב כולל את כל החיובים שעוד צפויים לרדת החודש, גם אם יום החיוב
        בתאריך עתידי. תשלומי כרטיס מקושרים לכרטיס נספרים פעם אחת בלבד.
      </p>
    </section>
  );
}
