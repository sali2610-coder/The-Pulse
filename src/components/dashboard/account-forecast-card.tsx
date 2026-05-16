"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Banknote, Building2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { forecastByAccount, type AccountForecast } from "@/lib/forecast";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function AccountForecastCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const forecasts = useMemo<AccountForecast[]>(() => {
    if (!hydrated) return [];
    return forecastByAccount({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  if (!hydrated || forecasts.length < 2) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <Building2 className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            תחזית פר חשבון
          </span>
          <span className="text-base font-semibold text-foreground">
            {forecasts.length} חשבונות בנק פעילים
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {forecasts.map((f) => {
          const accent = f.goesNegative ? "#F87171" : "#34D399";
          const delta = f.forecast - f.anchorBalance;
          const deltaSign = delta >= 0 ? "+" : "−";
          return (
            <li
              key={f.accountId}
              className="rounded-2xl border border-white/8 bg-surface/50 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold">
                  <Banknote className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="line-clamp-1 text-sm font-medium text-foreground">
                    {f.label}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span dir="ltr">היום {ILS.format(f.anchorBalance)}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span dir="ltr">
                      {deltaSign}
                      {ILS.format(Math.abs(delta))} צפוי
                    </span>
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    dir="ltr"
                    data-mono="true"
                    className="text-sm font-semibold"
                    style={{ color: accent }}
                  >
                    {ILS.format(f.forecast)}
                  </span>
                  {f.goesNegative && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#F87171]">
                      <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                      חריגה
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground">
        חיובים, הכנסות והלוואות לא משויכות מתחלקות יחסית ליתרת ה־anchor של כל
        חשבון.
      </p>
    </motion.section>
  );
}
