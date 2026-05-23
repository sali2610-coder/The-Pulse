"use client";

// Daily insights card — surfaces up to 3 short Hebrew observations
// from the dailyInsights engine. Auto-hides when none fire so a
// quiet day produces a clean dashboard.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { dailyInsights, type DailyInsight } from "@/lib/daily-insights";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { listReveal } from "@/lib/motion-tokens";

const SEV_DOT: Record<InsightSeverity, string> = {
  info: "#34D399",
  watch: "#D4AF37",
  warn: "#F87171",
  critical: "#F87171",
};

const KIND_LABEL: Record<DailyInsight["kind"], string> = {
  today_above_average: "ממוצע",
  dormant_merchant: "ביקור",
  duplicate_charges: "חיובים כפולים",
  category_spike: "חריגה",
  busiest_day: "פסגה שבועית",
};

export function DailyInsightsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);

  const insights = useMemo(() => {
    if (!hydrated) return [];
    return dailyInsights({ entries, rules }).slice(0, 4);
  }, [hydrated, entries, rules]);

  if (!hydrated) return null;
  if (insights.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Sparkles />}
        title="תובנות היום"
        trailing={
          <span className="text-[10px] text-muted-foreground/70" dir="ltr">
            {insights.length}
          </span>
        }
      />
      <ul className="flex flex-col gap-1.5">
        {insights.map((i, idx) => {
          const dot = SEV_DOT[i.severity as InsightSeverity];
          return (
            <motion.li
              key={`${i.kind}:${idx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={listReveal(idx)}
              className="flex items-start gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5"
            >
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ background: dot }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12px] leading-snug text-foreground">
                  {i.text}
                </span>
                <InsightChip
                  severity={i.severity as InsightSeverity}
                  label={KIND_LABEL[i.kind]}
                />
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
