"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Activity,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildEngineCtx, getSnapshot } from "@/lib/financial-engine";
import { useSnapshot } from "@/lib/snapshot-context";
import {
  buildSmartSummary,
  type SummaryTone,
} from "@/lib/smart-summary";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const TONE_STYLE: Record<
  SummaryTone,
  { dot: string; text: string; iconBg: string }
> = {
  positive: {
    dot: "bg-[#34D399]",
    text: "text-foreground",
    iconBg: "bg-[#34D399]/14 text-[#34D399]",
  },
  calm: {
    dot: "bg-[color:var(--neon)]",
    text: "text-foreground/90",
    iconBg: "bg-[color:var(--neon)]/12 text-[color:var(--neon)]",
  },
  watch: {
    dot: "bg-gold",
    text: "text-foreground/90",
    iconBg: "bg-gold/15 text-gold",
  },
  warn: {
    dot: "bg-gold",
    text: "text-foreground",
    iconBg: "bg-gold/15 text-gold",
  },
  danger: {
    dot: "bg-destructive",
    text: "text-foreground",
    iconBg: "bg-destructive/15 text-destructive",
  },
};

function toneIcon(tone: SummaryTone) {
  if (tone === "positive") return <ShieldCheck className="size-3.5" />;
  if (tone === "danger") return <Activity className="size-3.5" />;
  if (tone === "calm") return <TrendingUp className="size-3.5" />;
  return <Sparkles className="size-3.5" />;
}

/**
 * Smart-summary card — calm headline that explains the financial state
 * in one or two Hebrew sentences. Sits above the dense tiles so the
 * user reads one line and knows where they stand.
 *
 * Designed to feel quiet:
 *   - no heavy borders, single rounded glass surface
 *   - soft tone dot instead of saturated background
 *   - sentence typography (regular weight) instead of bold metric type
 */
export function SmartSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const sharedSnapshot = useSnapshot();
  const lines = useMemo(() => {
    if (!hydrated) return [];
    const snapshot =
      sharedSnapshot ??
      getSnapshot(
        buildEngineCtx({
          accounts,
          loans,
          incomes,
          entries,
          rules,
          statuses,
          monthlyBudget,
          monthKey: currentMonthKey(),
        }),
      );
    return buildSmartSummary({
      snapshot,
      incomes,
      loans,
    });
  }, [
    hydrated,
    sharedSnapshot,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

  if (!hydrated || lines.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <Sparkles className="size-3 text-gold" />
        תקציר חכם
      </header>

      <ul className="flex flex-col gap-1.5">
        {lines.map((line, idx) => {
          const style = TONE_STYLE[line.tone];
          return (
            <motion.li
              key={`${line.tone}-${idx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.32,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-start gap-2.5"
            >
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}
              >
                {toneIcon(line.tone)}
              </span>
              <p className={`text-[13.5px] leading-snug ${style.text}`}>
                {line.text}
              </p>
            </motion.li>
          );
        })}
      </ul>

      <footer className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <ChevronLeft className="size-2.5" />
        מבוסס על משכורות, הלוואות, חיובים קבועים והוצאות שכבר נכנסו.
      </footer>
    </section>
  );
}
