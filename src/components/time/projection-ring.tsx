"use client";

// Phase 358 — ProjectionRing.
//
// SVG ring with stroke-dash sweep tied to confidence, gradient
// shifting by state band, and a soft outer halo that breathes on
// calm states / steadies on alert.
//
// All visual; no calculations.

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

import type { ForecastHealth } from "@/lib/forecast-health";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const BAND_STROKE: Record<ForecastHealth["band"], [string, string]> = {
  safe: ["#D4AF37", "#F6D970"],
  steady: ["#00E5FF", "#75F5FF"],
  watch: ["#F5C76A", "#D4AF37"],
  risk: ["#FF8A65", "#F87171"],
  danger: ["#F87171", "#B91C1C"],
};

export function ProjectionRing({
  balance,
  cursorISO,
  health,
  cursorOffset,
}: {
  balance: number;
  cursorISO: string;
  health: ForecastHealth | null;
  cursorOffset: number;
}) {
  const value = useMotionValue(balance);
  const spring = useSpring(value, { stiffness: 110, damping: 22 });
  const display = useTransform(spring, (v) => {
    const n = Math.round(v);
    const sign = n < 0 ? "−" : "";
    return `${sign}${ILS.format(Math.abs(n))}`;
  });

  useEffect(() => {
    value.set(balance);
  }, [balance, value]);

  const band = health?.band ?? "steady";
  const [from, to] = BAND_STROKE[band];
  const score = health?.score ?? 50;
  const sweep = Math.max(0.08, Math.min(1, score / 100));

  // Ring geometry — 320×320 viewBox.
  const SIZE = 320;
  const R = 138;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - sweep);

  return (
    <div
      className="relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center"
      aria-label="טבעת תחזית"
    >
      {/* Outer halo — breathes calmly on safe/steady, stands still on alert. */}
      <motion.div
        aria-hidden
        className="absolute inset-2 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${from}22 0%, ${from}00 65%)`,
          filter: "blur(18px)",
        }}
        animate={
          band === "safe" || band === "steady"
            ? { opacity: [0.55, 0.85, 0.55], scale: [0.98, 1.02, 0.98] }
            : { opacity: 0.7, scale: 1 }
        }
        transition={
          band === "safe" || band === "steady"
            ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.4 }
        }
      />

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <filter id="ringGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={10}
        />

        {/* Sweep */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          // Rotate so 0° starts at top-right and sweeps clockwise.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          filter="url(#ringGlow)"
        />

        {/* Tick marks — soft dots every 30°. */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const x = SIZE / 2 + Math.cos(a) * (R + 16);
          const y = SIZE / 2 + Math.sin(a) * (R + 16);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={1.2}
              fill="rgba(255,255,255,0.18)"
            />
          );
        })}
      </svg>

      {/* Center stack */}
      <div className="relative flex flex-col items-center gap-2 text-center">
        <span
          className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
          aria-hidden
        >
          {cursorOffset === 0 ? "עכשיו" : `+${cursorOffset} ימים`}
        </span>
        <motion.span
          data-mono="true"
          dir="ltr"
          className="text-[44px] font-light leading-none text-foreground sm:text-[56px]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <motion.span>{display}</motion.span>
        </motion.span>
        <span
          className="text-caption text-muted-foreground"
          dir="rtl"
        >
          {DAY_FMT.format(new Date(cursorISO))}
        </span>
      </div>
    </div>
  );
}
