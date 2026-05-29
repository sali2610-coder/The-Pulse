"use client";

// Phase 317 — 3-tile KPI strip for the Home obligations section.
// Sits above LoanSummaryCard + HousingCard to anchor the user in
// the bottom line: how much leaves the account monthly, how much
// is loans, how much is recurring bills.

import { useMemo } from "react";
import { Banknote, Home, Receipt } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildObligationsOverview } from "@/lib/obligations-overview";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function MonthlyObligationsHeader() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);

  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, loans, rules, accounts]);

  if (!hydrated || !overview) return null;
  if (overview.monthlyTotal === 0) return null;

  return (
    <section className="glass-card rounded-3xl p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          תמונת מצב חודשית
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[10px] text-muted-foreground/80"
        >
          {overview.monthKey}
        </span>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Tile
          icon={<Receipt className="size-3.5" />}
          label="סה״כ החודש"
          value={ILS.format(overview.monthlyTotal)}
          tone="#F87171"
          emphasis
        />
        <Tile
          icon={<Banknote className="size-3.5" />}
          label="הלוואות"
          value={ILS.format(overview.loansMonthly)}
          tone="#A78BFA"
        />
        <Tile
          icon={<Home className="size-3.5" />}
          label="קבועים"
          value={ILS.format(overview.recurringMonthly)}
          tone="#D4AF37"
        />
      </div>
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <span style={{ color: tone }}>{icon}</span>
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className={
          emphasis
            ? "text-[16px] font-semibold"
            : "text-[14px] font-medium"
        }
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
