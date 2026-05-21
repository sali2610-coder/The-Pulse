"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Scale, TrendingDown, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { computeNetWorth } from "@/lib/net-worth";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * Bottom-line net-worth snapshot. Surfaces only when the user has
 * something meaningful tracked (≥ 1 active account or ≥ 1 active
 * loan), so a fresh install stays calm.
 */
export function NetWorthCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const entries = useFinanceStore((s) => s.entries);

  const nw = useMemo(() => {
    if (!hydrated) return null;
    return computeNetWorth({
      accounts,
      loans,
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, entries]);

  if (!hydrated || !nw) return null;
  const hasAnyEntity =
    accounts.some((a) => a.active) || loans.some((l) => l.active);
  if (!hasAnyEntity) return null;
  if (nw.assets === 0 && nw.totalDebt === 0) return null;

  const positive = nw.netWorth >= 0;
  const tone = positive ? "#34D399" : "#F87171";
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}22`, color: tone }}
          >
            <Scale className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              שווי נטו
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              נכסים פחות חובות, נכון לרגע זה
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5" style={{ color: tone }} strokeWidth={1.8} />
          <span
            data-mono="true"
            dir="ltr"
            className="text-[17px] font-semibold"
            style={{ color: tone }}
          >
            {positive ? "+" : "−"}
            {ILS.format(Math.abs(nw.netWorth))}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="נכסים" value={ILS.format(nw.assets)} tone="#34D399" />
        <Tile
          label="חובות"
          value={ILS.format(nw.totalDebt)}
          tone="#F87171"
        />
      </div>

      {nw.totalDebt > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/85">
          {nw.overdraft > 0 ? (
            <span data-mono="true" dir="ltr">
              משיכת יתר {ILS.format(nw.overdraft)}
            </span>
          ) : null}
          {nw.cardDebt > 0 ? (
            <span data-mono="true" dir="ltr">
              כרטיסי אשראי {ILS.format(nw.cardDebt)}
            </span>
          ) : null}
          {nw.loanDebt > 0 ? (
            <span data-mono="true" dir="ltr">
              הלוואות {ILS.format(nw.loanDebt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </motion.section>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/6 bg-background/30 p-2.5">
      <span className="text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[13px] font-semibold"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
