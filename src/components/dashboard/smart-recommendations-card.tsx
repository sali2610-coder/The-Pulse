"use client";

// Smart spending recommendations. Synthesizes the existing financial
// signals into a short list of Hebrew tips. Auto-hides when none fire.

import { useMemo } from "react";
import { Lightbulb } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  spendingRecommendations,
  type SpendingRecommendation,
} from "@/lib/spending-recommendations";

const TONE: Record<SpendingRecommendation["severity"], string> = {
  info: "#34D399",
  watch: "#D4AF37",
  warn: "#F87171",
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
      <header className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <Lightbulb className="size-3 text-[color:var(--neon)]" />
        המלצות חכמות
      </header>
      <ul className="flex flex-col gap-2">
        {tips.map((tip) => {
          const tone = TONE[tip.severity];
          return (
            <li
              key={tip.id}
              className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex size-2 shrink-0 translate-y-1.5 rounded-full"
                  style={{ background: tone }}
                  aria-hidden
                />
                <span className="flex-1 text-[12px] font-medium text-foreground">
                  {tip.title}
                </span>
                {tip.anchor ? (
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${tone}1a`, color: tone }}
                    dir="ltr"
                  >
                    {tip.anchor.label} {tip.anchor.value}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground/90">
                {tip.detail}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
