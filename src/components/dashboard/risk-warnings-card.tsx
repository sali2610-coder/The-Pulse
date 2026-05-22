"use client";

// Forward-looking risk surface. Renders the prioritised list from
// buildRiskWarnings — most severe first. Auto-hides when the list
// is empty (the calm-by-default rule).

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  Eye,
  Info,
  ShieldAlert,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildRiskWarnings, type RiskSeverity } from "@/lib/risk-warnings";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE: Record<RiskSeverity, string> = {
  alert: "#F87171",
  warn: "#D4AF37",
  watch: "#FCD34D",
  info: "#A1A1AA",
};

function severityIcon(s: RiskSeverity) {
  if (s === "alert") return AlertOctagon;
  if (s === "warn") return AlertTriangle;
  if (s === "watch") return Eye;
  return Info;
}

export function RiskWarningsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const warnings = useMemo(() => {
    if (!hydrated) return [];
    return buildRiskWarnings({
      accounts,
      loans,
      incomes,
      rules,
      entries,
      statuses,
      monthlyBudget,
    });
  }, [hydrated, accounts, loans, incomes, rules, entries, statuses, monthlyBudget]);

  if (!hydrated || warnings.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="size-3 text-[color:var(--neon)]" />
          סיכוני תזרים
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {warnings.length} סימנים
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {warnings.map((w, idx) => {
          const Icon = severityIcon(w.severity);
          const tone = TONE[w.severity];
          return (
            <motion.li
              key={w.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.25,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-start gap-2 rounded-2xl border border-white/8 bg-black/25 p-3"
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${tone}22`, color: tone }}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-foreground">
                    {w.title}
                  </span>
                  {typeof w.amount === "number" ? (
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="text-[11px]"
                      style={{ color: tone }}
                    >
                      {ILS.format(w.amount)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {w.detail}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
