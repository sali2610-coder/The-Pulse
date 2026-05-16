"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Heart, ShieldAlert, ThumbsUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildHealthScore, type HealthTone } from "@/lib/health-score";

const TONE_COLOR: Record<HealthTone, string> = {
  great: "#34D399",
  good: "#00E5FF",
  watch: "#F5C451",
  danger: "#F87171",
};

function ToneIcon({ tone }: { tone: HealthTone }) {
  switch (tone) {
    case "great":
      return <ThumbsUp className="h-5 w-5" strokeWidth={1.7} />;
    case "good":
      return <Heart className="h-5 w-5" strokeWidth={1.7} />;
    case "watch":
      return <Activity className="h-5 w-5" strokeWidth={1.7} />;
    case "danger":
      return <ShieldAlert className="h-5 w-5" strokeWidth={1.7} />;
  }
}

const RADIUS = 38;
const STROKE = 6;
const CIRC = 2 * Math.PI * RADIUS;

export function HealthScoreCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const health = useMemo(() => {
    if (!hydrated) return null;
    return buildHealthScore({
      entries,
      rules,
      statuses,
      accounts,
      loans,
      incomes,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    loans,
    incomes,
    monthlyBudget,
  ]);

  if (!hydrated || !health) return null;
  const accent = TONE_COLOR[health.tone];
  const dash = (health.score / 100) * CIRC;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, duration: 0.4 }}
      className="glass-card flex flex-col gap-4 rounded-3xl p-5"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${accent}55`,
      }}
    >
      <div className="flex items-center gap-4">
        {/* Ring + score */}
        <div className="relative shrink-0">
          <svg width={96} height={96} viewBox="0 0 96 96">
            <circle
              cx={48}
              cy={48}
              r={RADIUS}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE}
              fill="none"
            />
            <motion.circle
              cx={48}
              cy={48}
              r={RADIUS}
              stroke={accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              initial={{ strokeDasharray: `0 ${CIRC}` }}
              animate={{ strokeDasharray: `${dash} ${CIRC - dash}` }}
              transition={{ delay: 0.15, duration: 0.9, ease: "easeOut" }}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "center",
              }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span
              data-mono="true"
              className="text-2xl font-light leading-none"
              style={{ color: accent }}
            >
              {health.score}
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              / 100
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            ציון בריאות פיננסי
          </span>
          <span
            className="flex items-center gap-2 text-lg font-semibold"
            style={{ color: accent }}
          >
            <ToneIcon tone={health.tone} />
            {health.verdict}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {health.headline}
          </span>
        </div>
      </div>

      {/* Sub-score grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            { key: "forecast", label: "צפי" },
            { key: "budget", label: "תקציב" },
            { key: "anomalies", label: "חריגים" },
            { key: "pace", label: "קצב" },
          ] as const
        ).map((sub) => {
          const v = health.sub[sub.key];
          const subAccent =
            v >= 80
              ? TONE_COLOR.great
              : v >= 65
                ? TONE_COLOR.good
                : v >= 45
                  ? TONE_COLOR.watch
                  : TONE_COLOR.danger;
          return (
            <div
              key={sub.key}
              className="flex flex-col gap-1 rounded-xl border border-white/5 bg-black/25 px-2 py-2"
            >
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {sub.label}
              </span>
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${v}%` }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="h-full rounded-full"
                  style={{ background: subAccent }}
                />
              </div>
              <span
                data-mono="true"
                className="text-xs font-semibold"
                style={{ color: subAccent }}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
