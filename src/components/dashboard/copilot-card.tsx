"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Compass,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildCopilotInsights,
  type InsightSeverity,
} from "@/lib/copilot-insights";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const SEVERITY_STYLE: Record<
  InsightSeverity,
  { icon: typeof ShieldCheck; iconBg: string; bodyColor: string }
> = {
  info: {
    icon: Sparkles,
    iconBg: "bg-white/8 text-foreground/80",
    bodyColor: "text-foreground/85",
  },
  calm: {
    icon: ShieldCheck,
    iconBg: "bg-[color:var(--neon)]/12 text-[color:var(--neon)]",
    bodyColor: "text-foreground/85",
  },
  watch: {
    icon: Compass,
    iconBg: "bg-gold/14 text-gold",
    bodyColor: "text-foreground/85",
  },
  warn: {
    icon: AlertTriangle,
    iconBg: "bg-gold/18 text-gold",
    bodyColor: "text-foreground/90",
  },
  danger: {
    icon: ShieldAlert,
    iconBg: "bg-destructive/15 text-destructive",
    bodyColor: "text-foreground",
  },
};

/**
 * "טייס פיננסי" — forward-looking copilot card. Surfaces 1-3
 * proactive observations sorted by severity. Sits below the smart
 * summary card so the user reads:
 *   "I'm OK"   → smart summary
 *   "but look at this" → copilot
 */
export function CopilotCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const insights = useMemo(() => {
    if (!hydrated) return [];
    return buildCopilotInsights({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses, monthlyBudget]);

  if (!hydrated || insights.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <Compass className="size-3 text-[color:var(--neon)]" />
        טייס פיננסי
      </header>

      <ul className="flex flex-col gap-2">
        {insights.map((insight, idx) => {
          const style = SEVERITY_STYLE[insight.severity];
          const Icon = style.icon;
          return (
            <motion.li
              key={insight.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.32,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-start gap-2.5"
            >
              <span
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}
              >
                <Icon className="size-3.5" strokeWidth={1.8} />
              </span>
              <div className="flex flex-col gap-0.5 leading-snug">
                <p className="text-[13px] font-medium text-foreground">
                  {insight.headline}
                </p>
                {insight.body ? (
                  <p className={`text-[11px] ${style.bodyColor}`}>
                    {insight.body}
                  </p>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
