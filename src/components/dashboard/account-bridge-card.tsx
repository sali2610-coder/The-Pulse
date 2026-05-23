"use client";

// "מצב חשבון מול הוצאות" — the bridge between bank balance and
// real obligations. Walks the user through:
//   1. current bank balance
//   2. spent this month
//   3. income this month
//   4. pending obligations (fixed + loans + future card debits)
//   5. expected balance after everything
//
// Auto-hides until at least one bank account has an anchor — no
// anchor means no balance number to connect against.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarClock,
  Equal,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { accountBridge } from "@/lib/account-bridge";
import { SectionHeader } from "@/components/ui/section-header";
import { listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function formatSigned(n: number): string {
  if (n === 0) return ILS.format(0);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(n))}`;
}

export function AccountBridgeCard() {
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
  // Hide when no anchors at all — the bridge isn't meaningful.
  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) return null;

  const rows: Array<{
    icon: React.ReactNode;
    label: string;
    value: number;
    tone?: "positive" | "negative" | "neutral";
    signed?: boolean;
  }> = [
    {
      icon: <Banknote className="size-3" />,
      label: "יתרה נוכחית בבנק",
      value: bridge.currentBankBalance,
      tone: bridge.currentBankBalance < 0 ? "negative" : "neutral",
      signed: true,
    },
    {
      icon: <ArrowDown className="size-3" />,
      label: "הוצאות מתחילת החודש",
      value: bridge.spentThisMonth,
      tone: "negative",
    },
    {
      icon: <ArrowUp className="size-3" />,
      label: "הכנסות שעוד יגיעו",
      value: bridge.expectedIncomeRemaining,
      tone: "positive",
    },
    {
      icon: <CalendarClock className="size-3" />,
      label: "התחייבויות שעוד ירדו",
      value: bridge.pendingObligationsTotal,
      tone: "negative",
    },
  ];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Activity />}
        title="מצב חשבון מול הוצאות"
      />
      <ul className="flex flex-col gap-1">
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
              className="text-[13px] font-medium"
              style={{
                color:
                  r.tone === "negative"
                    ? "#F87171"
                    : r.tone === "positive"
                      ? "#34D399"
                      : undefined,
              }}
            >
              {r.signed ? formatSigned(r.value) : ILS.format(r.value)}
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between rounded-2xl border border-[color:var(--neon)]/30 bg-[color:var(--neon)]/10 p-3">
        <span className="flex items-center gap-1.5 text-[12px] text-[color:var(--neon)]">
          <Equal className="size-3" />
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
          {formatSigned(bridge.expectedBalanceAfterAllObligations)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/80">
        החיוב הצפוי כולל הוצאות קבועות, הלוואות, פריסות, וכל חיוב כרטיס שעוד
        אמור לרדת. ההוצאות שכבר נכנסו כבר משוקפות ביתרת הבנק.
      </p>
    </section>
  );
}
