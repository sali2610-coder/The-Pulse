"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Banknote, CreditCard } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { actualByPaymentMethod } from "@/lib/projections";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function CashVsCredit() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const { cash, credit, total, cashPct, creditPct } = useMemo(() => {
    if (!hydrated)
      return { cash: 0, credit: 0, total: 0, cashPct: 0, creditPct: 0 };
    const totals = actualByPaymentMethod({
      entries,
      monthKey: currentMonthKey(),
    });
    const t = totals.cash + totals.credit;
    return {
      cash: totals.cash,
      credit: totals.credit,
      total: t,
      cashPct: t > 0 ? (totals.cash / t) * 100 : 0,
      creditPct: t > 0 ? (totals.credit / t) * 100 : 0,
    };
  }, [hydrated, entries]);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            מזומן מול אשראי
          </div>
          <div className="mt-1 text-sm text-muted-foreground">החודש</div>
        </div>
        <div
          data-mono="true"
          className="text-base text-foreground"
          style={{ direction: "ltr" }}
        >
          {formatILS(total)}
        </div>
      </header>

      <div className="flex h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
        <motion.div
          animate={{ width: `${creditPct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          style={{
            background:
              "linear-gradient(90deg, #00E5FF, color-mix(in oklab, #00E5FF 60%, white))",
            boxShadow: "0 0 18px -2px rgba(0,229,255,0.6)",
          }}
        />
        <motion.div
          animate={{ width: `${cashPct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          style={{
            background:
              "linear-gradient(90deg, #D4AF37, color-mix(in oklab, #D4AF37 60%, white))",
            boxShadow: "0 0 18px -2px rgba(212,175,55,0.5)",
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Block
          icon={<CreditCard className="size-4" style={{ color: "#00E5FF" }} />}
          label="אשראי"
          amount={credit}
          pct={creditPct}
        />
        <Block
          icon={<Banknote className="size-4" style={{ color: "#D4AF37" }} />}
          label="מזומן"
          amount={cash}
          pct={cashPct}
        />
      </div>
    </section>
  );
}

function Block({
  icon,
  label,
  amount,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  pct: number;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <span className="text-[11px] text-muted-foreground/70">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        data-mono="true"
        className="mt-1 text-lg text-foreground"
        style={{ direction: "ltr" }}
      >
        {new Intl.NumberFormat("he-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 0,
        }).format(amount)}
      </div>
    </div>
  );
}
