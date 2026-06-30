"use client";

// Phase 432 part 5 · AURORA v1 — Visualization atoms.
//
// Hand-rolled SVG primitives. No charting dependency. Each atom
// reads tokens via inline style or CSS class so theme flips work
// without per-chart edits. Animations honor prefers-reduced-motion.

import { motion, useReducedMotion } from "framer-motion";

// ── LineChart ──────────────────────────────────────────────────
// Smooth animated polyline + filled area + end-of-line marker.
// Used by the 30-day cashflow forecast.

export function LineChart({
  values,
  height = 120,
  stroke = "url(#aurora-line-grad)",
  fill = "url(#aurora-line-fill)",
}: {
  values: number[];
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  const reduced = useReducedMotion();
  if (values.length === 0) {
    return (
      <div
        style={{
          height,
          borderRadius: "var(--aurora-radius-input)",
          background: "var(--aurora-hairline-faint)",
        }}
      />
    );
  }
  const w = 320;
  const h = height;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - 6 - ((v - min) / span) * (h - 12);
    return [x, y] as [number, number];
  });
  const linePath = pts
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", width: "100%", height }}
    >
      <defs>
        <linearGradient id="aurora-line-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--aurora-brand-aurora-1)" />
          <stop offset="100%" stopColor="var(--aurora-brand-aurora-2)" />
        </linearGradient>
        <linearGradient id="aurora-line-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(0, 229, 255, 0.32)" />
          <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={fill}
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: reduced ? 0.12 : 0.6,
          delay: reduced ? 0 : 0.18,
          ease: [0.32, 0.72, 0, 1],
        }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={
          reduced
            ? { pathLength: 1, opacity: 1 }
            : { pathLength: 0, opacity: 0 }
        }
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: reduced ? 0.12 : 0.9,
          ease: [0.32, 0.72, 0, 1],
        }}
      />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r="3"
        fill="var(--aurora-brand-aurora-2)"
        initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reduced ? 0.12 : 0.5,
          delay: reduced ? 0 : 0.8,
          ease: [0.32, 0.72, 0, 1],
        }}
      />
    </svg>
  );
}

// ── Donut ──────────────────────────────────────────────────────
// Token-driven, animated arc-fill donut for category split.

export type DonutSlice = {
  label: string;
  amount: number;
  color: string;
};

export function Donut({
  slices,
  size = 132,
  thickness = 14,
  centerLabel,
  centerSub,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const reduced = useReducedMotion();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, slices.reduce((s, x) => s + x.amount, 0));
  // Precompute per-slice dash + offset so we don't mutate state in
  // the render body (React 19 lint forbids it).
  const sliceGeometry = slices.reduce<
    Array<{ slice: DonutSlice; dash: number; offset: number }>
  >((accList, s) => {
    const portion = s.amount / total;
    const dash = portion * c;
    const offset = accList.reduce((sum, x) => sum + x.dash, 0);
    accList.push({ slice: s, dash, offset });
    return accList;
  }, []);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--aurora-hairline-quiet)"
        strokeWidth={thickness}
        fill="none"
      />
      {sliceGeometry.map(({ slice: s, dash, offset }, i) => {
        return (
          <motion.circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={s.color}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
            initial={
              reduced
                ? { opacity: 1, pathLength: 1 }
                : { opacity: 0, pathLength: 0 }
            }
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{
              duration: reduced ? 0.12 : 0.7,
              delay: reduced ? 0 : 0.12 + i * 0.06,
              ease: [0.32, 0.72, 0, 1],
            }}
          />
        );
      })}
      {centerLabel ? (
        <g>
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            fontSize="20"
            fontWeight="300"
            fill="var(--aurora-ink-1)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {centerLabel}
          </text>
          {centerSub ? (
            <text
              x={size / 2}
              y={size / 2 + 14}
              textAnchor="middle"
              fontSize="10"
              fill="var(--aurora-ink-3)"
            >
              {centerSub}
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

// ── MonthProgressBar ──────────────────────────────────────────
// Slim track at the bottom of the Hero showing day X / total, with
// markers for salary day and forecast crossing.

export function MonthProgressBar({
  dayOfMonth,
  totalDays,
  markers = [],
}: {
  dayOfMonth: number;
  totalDays: number;
  markers?: Array<{ day: number; label: string; tone?: "safe" | "watch" | "danger" }>;
}) {
  const pct = Math.min(100, Math.max(0, (dayOfMonth / totalDays) * 100));
  const reduced = useReducedMotion();
  return (
    <div aria-hidden className="aurora-month-progress">
      <div className="aurora-month-progress-track">
        <motion.div
          className="aurora-month-progress-fill"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: reduced ? 0.12 : 0.9,
            ease: [0.32, 0.72, 0, 1],
          }}
        />
        {markers.map((m) => {
          const left = Math.min(100, Math.max(0, (m.day / totalDays) * 100));
          return (
            <span
              key={`${m.day}-${m.label}`}
              className="aurora-month-marker"
              data-aurora-tone={m.tone ?? "safe"}
              style={{ insetInlineStart: `${left}%` }}
              title={m.label}
            />
          );
        })}
      </div>
      <div className="aurora-month-progress-labels">
        <span>יום {dayOfMonth}</span>
        <span>{totalDays} ימים</span>
      </div>
    </div>
  );
}

// ── HeatStrip ─────────────────────────────────────────────────
// Mini 7-day intensity bar for the spending velocity card.

export function HeatStrip({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const reduced = useReducedMotion();
  return (
    <div className="aurora-heat-strip" aria-hidden>
      {values.map((v, i) => (
        <motion.span
          key={i}
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 0.18 + (v / max) * 0.82 }}
          transition={{
            duration: reduced ? 0.12 : 0.4,
            delay: reduced ? 0 : 0.05 * i,
            ease: [0.32, 0.72, 0, 1],
          }}
          style={{ background: "var(--aurora-brand-aurora-2)" }}
        />
      ))}
    </div>
  );
}
