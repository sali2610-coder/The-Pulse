"use client";

// Phase 346 — Pulse Forecast mini gauge.
//
// Premium SVG arc rendered alongside the Hero forecast headline.
// Sweeps to the score returned by forecastHealthScore the instant
// the user taps a different date chip — the gauge IS the
// forecast reaction, not a frozen "today" snapshot.
//
// Layout: 180° arc, ~92×56 px. Single needle, gradient track,
// breathing glow. Dynamic accent per band:
//
//   safe   → #34D399 (mint)
//   watch  → #60A5FA (blue)
//   tight  → #F59E0B (amber)
//   danger → #F87171 (red)
//
// All animations spring-physics; respects reduced-motion via the
// Framer Motion MotionConfig already wrapped at the app root.

import { motion } from "framer-motion";

import type { ForecastHealthBand } from "@/lib/forecast-health";

const VIEW_W = 92;
const VIEW_H = 56;
const CX = VIEW_W / 2;
const CY = 50;
const R = 38;
const START_DEG = 180;
const END_DEG = 360;

const BAND_ACCENT: Record<ForecastHealthBand, string> = {
  safe: "#34D399",
  watch: "#60A5FA",
  tight: "#F59E0B",
  danger: "#F87171",
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function PulseForecastGauge({
  score,
  band,
}: {
  score: number;
  band: ForecastHealthBand;
}) {
  const safeScore = Math.max(0, Math.min(100, score));
  const accent = BAND_ACCENT[band];
  const needleDeg = START_DEG + ((END_DEG - START_DEG) * safeScore) / 100;
  const tip = polar(CX, CY, R - 6, needleDeg);

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: VIEW_W }}
      aria-label={`מד צפי: ${Math.round(safeScore)}`}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-12 w-full"
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id={`pfg-track-${band}`} x1="0%" x2="100%">
            <stop offset="0%" stopColor="#F87171" />
            <stop offset="33%" stopColor="#F59E0B" />
            <stop offset="66%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
          <filter id={`pfg-glow-${band}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dim outer ring */}
        <path
          d={describeArc(CX, CY, R + 4, START_DEG, END_DEG)}
          stroke="#ffffff10"
          strokeWidth={1}
          fill="none"
        />
        {/* Track */}
        <path
          d={describeArc(CX, CY, R, START_DEG, END_DEG)}
          stroke="#ffffff12"
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
        {/* Gradient sweep */}
        <path
          d={describeArc(CX, CY, R, START_DEG, END_DEG)}
          stroke={`url(#pfg-track-${band})`}
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
          opacity={0.95}
          filter={`url(#pfg-glow-${band})`}
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((p) => {
          const deg = START_DEG + ((END_DEG - START_DEG) * p) / 100;
          const a = polar(CX, CY, R + 5, deg);
          const b = polar(CX, CY, R - 1, deg);
          return (
            <line
              key={p}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#ffffff44"
              strokeWidth={0.75}
            />
          );
        })}

        {/* Needle — outer glow + bright stroke */}
        <motion.line
          x1={CX}
          y1={CY}
          x2={tip.x}
          y2={tip.y}
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.45}
          initial={false}
          animate={{ x2: tip.x, y2: tip.y }}
          transition={{ type: "spring", stiffness: 80, damping: 14 }}
          filter={`url(#pfg-glow-${band})`}
        />
        <motion.line
          x1={CX}
          y1={CY}
          x2={tip.x}
          y2={tip.y}
          stroke={accent}
          strokeWidth={1.75}
          strokeLinecap="round"
          initial={false}
          animate={{ x2: tip.x, y2: tip.y }}
          transition={{ type: "spring", stiffness: 80, damping: 14 }}
        />

        {/* Hub */}
        <circle
          cx={CX}
          cy={CY}
          r={4}
          fill="#0A0A0A"
          stroke={accent}
          strokeWidth={1}
        />
        <circle cx={CX} cy={CY} r={1.5} fill={accent} opacity={0.95} />

        {/* Center score */}
        <text
          x={CX}
          y={CY - 14}
          textAnchor="middle"
          style={{
            font: "300 14px ui-sans-serif, system-ui",
            fill: accent,
            letterSpacing: "-0.02em",
          }}
        >
          {Math.round(safeScore)}
        </text>
      </svg>
    </div>
  );
}
