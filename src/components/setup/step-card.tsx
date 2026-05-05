"use client";

import { motion } from "framer-motion";
import { Check, Circle } from "lucide-react";

export type StepState = "pending" | "current" | "done";

type Props = {
  number: number;
  title: string;
  subtitle?: string;
  state: StepState;
  accent: string; // hex color used for icon + glow
  icon: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Bento-style card for one step in the onboarding guide. Carries its own
 * accent color so the four cards feel like a related set without all looking
 * the same.
 */
export function StepCard({
  number,
  title,
  subtitle,
  state,
  accent,
  icon,
  children,
}: Props) {
  const stateColor =
    state === "done"
      ? "#34D399"
      : state === "current"
        ? accent
        : "rgba(255,255,255,0.4)";

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 90, damping: 18 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-2xl"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -50px ${accent}`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -end-12 size-32 rounded-full opacity-30 blur-3xl"
        style={{ background: accent }}
      />

      <header className="relative flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: `${accent}1a`,
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span
              className="inline-flex size-4 items-center justify-center rounded-full text-[10px]"
              style={{
                background: `${stateColor}22`,
                color: stateColor,
              }}
            >
              {number}
            </span>
            שלב
          </div>
          <h2 className="mt-1 text-base font-medium text-foreground">{title}</h2>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <StateBadge state={state} color={stateColor} />
      </header>

      <div className="relative mt-4 space-y-3 text-sm">{children}</div>
    </motion.section>
  );
}

function StateBadge({ state, color }: { state: StepState; color: string }) {
  if (state === "done") {
    return (
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${color}1a`, color }}
        aria-label="הושלם"
      >
        <Check className="size-4" />
      </motion.span>
    );
  }
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(255,255,255,0.04)", color }}
      aria-label={state === "current" ? "פעיל" : "ממתין"}
    >
      <Circle className="size-3.5" />
    </span>
  );
}
