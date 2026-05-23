"use client";

// Phase 206 — TodayPulseCard.
//
// Single-glance "today" tile that pulses on every change. After the
// user approves a charge via InstantConfirmSheet, this card's
// counter increments live with a tint-flash, so the dashboard feels
// alive instead of static.
//
// Compute is delegated to todayPulse(); no math here.

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, Bell, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { todayPulse, type PulseVibe } from "@/lib/today-pulse";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SPRING_SOFT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const VIBE_TONE: Record<PulseVibe, string> = {
  calm: "#34D399",
  watch: "#D4AF37",
  hot: "#F87171",
};

const VIBE_LABEL: Record<PulseVibe, string> = {
  calm: "קצב רגוע",
  watch: "קצב יציב",
  hot: "קצב גבוה",
};

const VIBE_SEV: Record<PulseVibe, InsightSeverity> = {
  calm: "info",
  watch: "watch",
  hot: "warn",
};

export function TodayPulseCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const pulse = useMemo(() => {
    if (!hydrated) return null;
    return todayPulse({ entries, rules, statuses, monthlyBudget });
  }, [hydrated, entries, rules, statuses, monthlyBudget]);

  // Tint-flash on spent-today change. Derive the AnimatePresence
  // key directly from the value — no effect, no setState. React
  // re-mounts the span whenever the rounded value changes.
  const reduced = useReducedMotion();
  if (!hydrated || !pulse) return null;
  const flashKey = pulse.spentToday;

  const tone = VIBE_TONE[pulse.vibe];

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="glass-card relative overflow-hidden rounded-3xl p-4"
    >
      {/* Tint pulse — brief glow on each spend update. */}
      {!reduced ? (
        <motion.span
          key={flashKey}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.35, 0] }}
          transition={{ duration: 0.9, times: [0, 0.15, 1] }}
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{
            background: `radial-gradient(circle at 80% 0%, ${tone}22 0%, transparent 60%)`,
          }}
        />
      ) : null}

      <SectionHeader
        icon={<Activity />}
        title="הפעימה של היום"
        trailing={
          pulse.pendingForReview > 0 ? (
            <InsightChip
              severity="watch"
              icon={<Bell className="size-2.5" />}
              label={`${pulse.pendingForReview} לאישור`}
            />
          ) : (
            <InsightChip
              severity={VIBE_SEV[pulse.vibe]}
              icon={<Sparkles className="size-2.5" />}
              label={VIBE_LABEL[pulse.vibe]}
            />
          )
        }
      />

      <div className="mt-2 flex items-baseline gap-3">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[32px] font-light leading-none"
          style={{ color: tone }}
        >
          <AnimatedCounter
            value={pulse.spentToday}
            format={(v) => ILS.format(v)}
          />
        </span>
        <span className="text-[11px] text-muted-foreground">
          {pulse.countToday > 0
            ? `על פני ${pulse.countToday} חיובים היום`
            : "אין חיובים היום"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {pulse.allowance > 0 ? (
          <span>
            מותר ליום ·{" "}
            <span data-mono="true" dir="ltr" className="text-foreground">
              {ILS.format(pulse.allowance)}
            </span>
          </span>
        ) : null}
        {pulse.refundedToday > 0 ? (
          <span style={{ color: "#34D399" }}>
            + זיכויים{" "}
            <span data-mono="true" dir="ltr">
              {ILS.format(pulse.refundedToday)}
            </span>
          </span>
        ) : null}
      </div>
    </motion.section>
  );
}
