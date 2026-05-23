"use client";

// Smart spending recommendations. Synthesizes the existing financial
// signals into a short list of Hebrew tips. Auto-hides when none fire.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  spendingRecommendations,
  type SpendingRecommendation,
} from "@/lib/spending-recommendations";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { listReveal } from "@/lib/motion-tokens";

const SEV_BG: Record<SpendingRecommendation["severity"], string> = {
  info: "#34D399",
  watch: "#D4AF37",
  warn: "#F87171",
};

const SEV_MAP: Record<SpendingRecommendation["severity"], InsightSeverity> = {
  info: "info",
  watch: "watch",
  warn: "warn",
};

export function SmartRecommendationsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const tips = useMemo(() => {
    if (!hydrated) return [];
    return spendingRecommendations({
      entries,
      rules,
      statuses,
      accounts,
      monthlyBudget,
    });
  }, [hydrated, entries, rules, statuses, accounts, monthlyBudget]);

  if (!hydrated) return null;
  if (tips.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader icon={<Lightbulb />} title="המלצות חכמות" />
      <ul className="flex flex-col gap-2">
        {tips.map((tip, idx) => {
          const dot = SEV_BG[tip.severity];
          return (
            <motion.li
              key={tip.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={listReveal(idx)}
              className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3 transition-colors hover:border-white/14"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex size-2 shrink-0 translate-y-1.5 rounded-full"
                  style={{ background: dot }}
                  aria-hidden
                />
                <span className="flex-1 text-[12px] font-medium text-foreground">
                  {tip.title}
                </span>
                {tip.anchor ? (
                  <InsightChip
                    severity={SEV_MAP[tip.severity]}
                    label={tip.anchor.label}
                    value={tip.anchor.value}
                  />
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground/90">
                {tip.detail}
              </p>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
