"use client";

// Phase 359 — ProjectionRing (premium polish).
//
// The ring is no longer decoration. It IS the timeline.
//
//   • Checkpoint nodes ride the ring's circumference. Tap one →
//     jump to that date.
//   • Active node glows. Inactive nodes are soft white pearls.
//   • Inner energy pulse breathes with the band tone.
//   • Six ambient particles drift slowly INSIDE the ring (canvas).
//   • Stroke gradient + glow shift smoothly between band tones.
//
// Engine untouched. Renders from props only.

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

import type { ForecastHealth } from "@/lib/forecast-health";
import type { Checkpoint } from "./use-time-engine";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import { playCheckpointTone } from "@/lib/time-chime";
import { useFinanceStore } from "@/lib/store";

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

const SIZE = 320;
const R = 138;
const C = 2 * Math.PI * R;

export function ProjectionRing({
  balance,
  cursorISO,
  health,
  cursorOffset,
  maxOffset,
  checkpoints,
  onPickCheckpoint,
}: {
  balance: number;
  cursorISO: string;
  health: ForecastHealth | null;
  cursorOffset: number;
  maxOffset: number;
  checkpoints: Checkpoint[];
  onPickCheckpoint: (c: Checkpoint) => void;
}) {
  const audioEnabled = useFinanceStore((s) => s.audioEnabled);

  // ── Number morph ──────────────────────────────────────────────
  const value = useMotionValue(balance);
  const spring = useSpring(value, { stiffness: 90, damping: 24, mass: 0.6 });
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
  const dashOffset = C * (1 - sweep);

  // ── Ambient particles inside the ring ─────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (c.width = SIZE * dpr);
    const h = (c.height = SIZE * dpr);
    type P = { a: number; r: number; speed: number; rad: number; alpha: number };
    const COUNT = 6;
    const items: P[] = Array.from({ length: COUNT }, () => ({
      a: Math.random() * Math.PI * 2,
      r: (40 + Math.random() * 80) * dpr,
      speed: 0.0006 + Math.random() * 0.0008,
      rad: (0.9 + Math.random() * 0.9) * dpr,
      alpha: 0.18 + Math.random() * 0.18,
    }));
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      for (const p of items) {
        p.a += p.speed;
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r;
        ctx.beginPath();
        ctx.arc(x, y, p.rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Checkpoint positions ──────────────────────────────────────
  // Distribute checkpoints around the upper hemisphere (12 → 6
  // clockwise) so they sit naturally above the number. Each node's
  // angle is proportional to its offset within [0, maxOffset].
  // First (0) goes top-right; last goes top-left.
  const cpPos = checkpoints.map((cp) => {
    const t = maxOffset > 0 ? cp.offset / maxOffset : 0;
    // Spread across 220° starting from -200° (right) to +20° (left).
    const angleDeg = -200 + t * 220;
    const angle = (angleDeg * Math.PI) / 180;
    const cx = SIZE / 2 + Math.cos(angle) * R;
    const cy = SIZE / 2 + Math.sin(angle) * R;
    return { cp, cx, cy };
  });

  const handlePick = (cp: Checkpoint) => {
    hapticSuccess();
    if (audioEnabled) playCheckpointTone();
    onPickCheckpoint(cp);
  };

  return (
    <div
      className="relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center"
      aria-label="טבעת תחזית"
    >
      {/* Outer halo — breathes calmly on safe/steady, holds steady on alert. */}
      <motion.div
        aria-hidden
        className="absolute inset-2 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${from}26 0%, ${from}00 65%)`,
          filter: "blur(22px)",
        }}
        animate={
          band === "safe" || band === "steady"
            ? { opacity: [0.55, 0.9, 0.55], scale: [0.98, 1.02, 0.98] }
            : { opacity: 0.75, scale: 1 }
        }
        transition={
          band === "safe" || band === "steady"
            ? { duration: 3.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.5 }
        }
      />

      {/* Ambient particles inside the ring */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={{ opacity: 0.7 }}
        aria-hidden
      />

      {/* Inner soft pulse — reads as a heartbeat without being one. */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: R * 1.4,
          height: R * 1.4,
          background: `radial-gradient(circle, ${from}18 0%, ${from}00 70%)`,
          filter: "blur(6px)",
        }}
        animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
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
          <radialGradient id="trackHighlight" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </radialGradient>
          <filter id="ringGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.4" result="blur" />
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
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={11}
        />
        {/* Top-highlight rim on the track — adds glass depth. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#trackHighlight)"
          strokeWidth={11}
        />

        {/* Sweep */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ type: "spring", stiffness: 80, damping: 22, mass: 0.8 }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          filter="url(#ringGlow)"
        />
      </svg>

      {/* Checkpoint nodes on the ring */}
      {cpPos.map(({ cp, cx, cy }) => {
        const isActive = Math.abs(cp.offset - cursorOffset) < 1;
        const pctX = (cx / SIZE) * 100;
        const pctY = (cy / SIZE) * 100;
        return (
          <button
            key={cp.kind}
            type="button"
            onClick={() => {
              hapticTap();
              handlePick(cp);
            }}
            aria-label={`קפיצה ל${cp.label}`}
            className="absolute z-20 cursor-pointer"
            style={{
              left: `${pctX}%`,
              top: `${pctY}%`,
              transform: "translate(-50%, -50%)",
              padding: 8, // tap target expansion
            }}
          >
            <motion.span
              animate={
                isActive
                  ? {
                      scale: [1, 1.18, 1],
                      boxShadow: [
                        `0 0 0px ${from}00`,
                        `0 0 16px ${from}cc`,
                        `0 0 8px ${from}99`,
                      ],
                    }
                  : { scale: 1, boxShadow: "0 0 0px transparent" }
              }
              transition={
                isActive
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
              className="block rounded-full"
              style={{
                width: isActive ? 14 : 8,
                height: isActive ? 14 : 8,
                background: isActive ? from : "rgba(255,255,255,0.55)",
                border: isActive
                  ? `1px solid ${to}`
                  : "1px solid rgba(255,255,255,0.18)",
              }}
            />
          </button>
        );
      })}

      {/* Center stack */}
      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
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
          style={{
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 24px ${from}33`,
          }}
        >
          <motion.span>{display}</motion.span>
        </motion.span>
        <span className="text-caption text-muted-foreground" dir="rtl">
          {DAY_FMT.format(new Date(cursorISO))}
        </span>
      </div>
    </div>
  );
}
