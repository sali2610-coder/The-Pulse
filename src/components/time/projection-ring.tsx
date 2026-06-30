"use client";

// Phase 363 — ProjectionRing (balance-vibe atmosphere).
//
// Visual language now reads from the BALANCE VIBE (not the engine
// band). One signal — the projected balance at the cursor —
// determines whether the screen feels HEALTHY, CAUTION, or RISK.
//
//   HEALTHY  emerald   • particles drift UP, occasional gentle
//                       sparkle bursts
//   CAUTION  warm gold • particles circle calmly, periodic shimmer
//                       sweep across the ring
//   RISK     deep red  • particles drift DOWN, slower decay; reads
//                       as oxygen leaving the chamber
//
// Engine math untouched. Pure presentation.

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Checkpoint } from "./use-time-engine";
import type { ForecastHealth } from "@/lib/forecast-health";
import {
  VIBE_TONE,
  vibeFromBalance,
  type BalanceVibe,
  type StateTone,
} from "./state-tone";
// Phase 428 — Time tab is sound-free. All haptic / chime calls
// stripped so the surface is fully silent.
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
  // Kept in the signature for compat — but the visual language now
  // reads from the balance vibe, not the engine band. The score is
  // still used to drive the stroke sweep length.
  health: ForecastHealth | null;
  cursorOffset: number;
  maxOffset: number;
  checkpoints: Checkpoint[];
  onPickCheckpoint: (c: Checkpoint) => void;
}) {
  // Phase 428 — audioEnabled no longer read here; Time tab is silent.
  void useFinanceStore;

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

  const vibe: BalanceVibe = vibeFromBalance(balance);
  const tone = VIBE_TONE[vibe];
  const from = tone.from;
  const to = tone.to;
  const score = health?.score ?? 50;
  const sweep = Math.max(0.08, Math.min(1, score / 100));
  const dashOffset = C * (1 - sweep);

  // ── Ambient particles inside the ring ─────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toneRef = useRef<StateTone>(tone);
  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (c.width = SIZE * dpr);
    const h = (c.height = SIZE * dpr);
    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rad: number;
      life: number;
      maxLife: number;
      seed: number;
    };
    const items: P[] = [];
    const COUNT = toneRef.current.particleCount;

    const respawn = (p: P) => {
      const cur = toneRef.current;
      const cx = w / 2;
      const cy = h / 2;
      // Start somewhere inside the ring's inner disc (radius R*0.85).
      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * R * 0.7) * dpr;
      p.x = cx + Math.cos(angle) * dist;
      p.y = cy + Math.sin(angle) * dist;
      p.rad = (0.9 + Math.random() * 1.0) * dpr;
      p.maxLife = 280 + Math.floor(Math.random() * 220);
      p.life = 0;
      p.seed = Math.random() * Math.PI * 2;
      const base = (0.20 + Math.random() * 0.25) * dpr * cur.particleSpeedMul;
      if (cur.drift === "up") {
        p.vx = (Math.random() - 0.5) * 0.18 * dpr;
        p.vy = -base; // upward
      } else if (cur.drift === "down") {
        p.vx = (Math.random() - 0.5) * 0.18 * dpr;
        p.vy = base * 0.85; // slow downward, oxygen-leak feel
      } else {
        // calm: gentle circular drift around center
        p.vx = Math.cos(angle + Math.PI / 2) * base * 0.6;
        p.vy = Math.sin(angle + Math.PI / 2) * base * 0.6;
      }
    };

    for (let i = 0; i < COUNT; i++) {
      const p: P = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rad: 1,
        life: 0,
        maxLife: 0,
        seed: 0,
      };
      respawn(p);
      // Stagger initial lives so they don't all expire together.
      p.life = Math.floor(Math.random() * p.maxLife);
      items.push(p);
    }

    // Sparkle bursts (healthy only).
    type Sparkle = { x: number; y: number; t: number; max: number };
    const sparkles: Sparkle[] = [];
    let nextSparkleAt = 0;

    // Shimmer sweep (caution only). 0..1 across the ring vertically.
    let shimmerT = -1;
    let nextShimmerAt = 0;

    let raf = 0;
    let frame = 0;
    const tick = () => {
      const cur = toneRef.current;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      // ── Particles ────────────────────────────────
      for (const p of items) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        const t = p.life / p.maxLife;
        // distance-from-center clamp — fade if escaping the inner disc.
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const inner = R * 0.96 * dpr;
        if (dist > inner || t >= 1) {
          respawn(p);
          continue;
        }
        // Smooth fade-in then fade-out.
        const fade = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
        const alpha = 0.18 + 0.32 * fade;
        const wobble = Math.sin(p.life * 0.06 + p.seed) * 0.18;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rad + wobble, 0, Math.PI * 2);
        ctx.fillStyle = cur.particle.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rad * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.6).toFixed(3)})`;
        ctx.fill();
      }

      // ── Sparkle bursts (HEALTHY) ─────────────────
      if (cur.sparkle) {
        if (frame >= nextSparkleAt) {
          const angle = Math.random() * Math.PI * 2;
          const dist = R * 0.5 * dpr;
          sparkles.push({
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            t: 0,
            max: 36,
          });
          // Sparkle every ~3-5s at 60fps.
          nextSparkleAt = frame + 180 + Math.floor(Math.random() * 120);
        }
        for (let i = sparkles.length - 1; i >= 0; i--) {
          const s = sparkles[i];
          s.t += 1;
          const p = s.t / s.max;
          if (p >= 1) {
            sparkles.splice(i, 1);
            continue;
          }
          const r = p * 14 * dpr;
          const alpha = (1 - p) * 0.55;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(110,231,183,${alpha.toFixed(3)})`;
          ctx.lineWidth = 1 * dpr;
          ctx.stroke();
          // Core dot
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1.4 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
          ctx.fill();
        }
      }

      // ── Shimmer sweep (CAUTION) ──────────────────
      if (cur.shimmer) {
        if (shimmerT < 0 && frame >= nextShimmerAt) shimmerT = 0;
        if (shimmerT >= 0) {
          shimmerT += 1 / 80; // ~80 frames sweep
          if (shimmerT >= 1) {
            shimmerT = -1;
            nextShimmerAt = frame + 280 + Math.floor(Math.random() * 160);
          } else {
            // Soft vertical band drifting top→bottom.
            const yPos = shimmerT * h;
            const grad = ctx.createLinearGradient(0, yPos - 40 * dpr, 0, yPos + 40 * dpr);
            grad.addColorStop(0, "rgba(246,217,112,0)");
            grad.addColorStop(0.5, "rgba(246,217,112,0.13)");
            grad.addColorStop(1, "rgba(246,217,112,0)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, yPos - 40 * dpr, w, 80 * dpr);
          }
        }
      } else {
        shimmerT = -1;
      }

      raf = requestAnimationFrame(tick);
      frame += 1;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vibe]);

  // ── Checkpoint positions ──────────────────────────────────────
  const cpPos = useMemo(() => {
    return checkpoints.map((cp) => {
      const t = maxOffset > 0 ? cp.offset / maxOffset : 0;
      const angleDeg = -200 + t * 220;
      const angle = (angleDeg * Math.PI) / 180;
      const cx = SIZE / 2 + Math.cos(angle) * R;
      const cy = SIZE / 2 + Math.sin(angle) * R;
      return { cp, cx, cy };
    });
  }, [checkpoints, maxOffset]);

  const handlePick = (cp: Checkpoint) => {
    onPickCheckpoint(cp);
  };

  // ── Vibe-change bloom — small pulse on state transition ──────
  const prevVibeRef = useRef<BalanceVibe>(vibe);
  const [bloomKey, setBloomKey] = useState(0);
  useEffect(() => {
    if (prevVibeRef.current !== vibe) {
      prevVibeRef.current = vibe;
      setBloomKey((k) => k + 1);
    }
  }, [vibe]);

  return (
    <div
      className="relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center"
      aria-label="טבעת תחזית"
    >
      {/* Outer halo — calmer breath for healthy, sustained glow for caution + risk. */}
      <motion.div
        aria-hidden
        className="absolute inset-2 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${from}28 0%, ${from}00 65%)`,
          filter: "blur(22px)",
        }}
        animate={
          vibe === "healthy"
            ? { opacity: [0.55, 0.92, 0.55], scale: [0.98, 1.025, 0.98] }
            : vibe === "caution"
              ? { opacity: [0.7, 0.95, 0.7], scale: [1, 1.012, 1] }
              : { opacity: [0.65, 0.85, 0.65], scale: [1, 1.008, 1] }
        }
        transition={
          vibe === "healthy"
            ? { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
            : vibe === "caution"
              ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 5.6, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* Vibe-change bloom — one soft expansion ring on transition. */}
      <motion.div
        key={`bloom-${bloomKey}`}
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: R * 2,
          height: R * 2,
          border: `1px solid ${from}66`,
        }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0, 0.5, 0], scale: [0.92, 1.06, 1.14] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />

      {/* Ambient particles inside the ring */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={{ opacity: 0.8 }}
        aria-hidden
      />

      {/* Inner soft pulse */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: R * 1.4,
          height: R * 1.4,
          background: `radial-gradient(circle, ${from}1c 0%, ${from}00 70%)`,
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
            <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
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

        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={11}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#trackHighlight)"
          strokeWidth={11}
        />

        {/* Phase 364 — stroke language per vibe:
            • healthy: solid stroke + thin inner highlight (Apple
              Watch confidence)
            • caution: solid stroke
            • risk:    slowly shifting dashes that read as
              energy draining out of the ring */}
        {vibe === "risk" ? (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray="14 10"
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: -48 }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "linear" }}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            filter="url(#ringGlow)"
            style={{ opacity: sweep }}
          />
        ) : (
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
        )}
        {/* Healthy-only inner highlight rail — thin white core
            running through the colored sweep, Apple Watch style. */}
        {vibe === "healthy" ? (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={C}
            initial={false}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ type: "spring", stiffness: 80, damping: 22, mass: 0.8 }}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            opacity={0.55}
          />
        ) : null}
      </svg>

      {/* Checkpoint nodes — custom kind not rendered (rail-only). */}
      {cpPos.map(({ cp, cx, cy }) => {
        if (cp.kind === "custom") return null;
        const isActive = Math.abs(cp.offset - cursorOffset) < 1;
        const pctX = (cx / SIZE) * 100;
        const pctY = (cy / SIZE) * 100;
        return (
          <button
            key={cp.kind}
            type="button"
            onClick={() => {
              handlePick(cp);
            }}
            aria-label={`קפיצה ל${cp.label}`}
            className="absolute z-20 cursor-pointer"
            style={{
              left: `${pctX}%`,
              top: `${pctY}%`,
              transform: "translate(-50%, -50%)",
              padding: 8,
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
          className="text-[48px] font-light leading-none sm:text-[64px]"
          style={{
            fontVariantNumeric: "tabular-nums",
            color: tone.numberTint,
            transition: "color 640ms ease",
          }}
          animate={{
            textShadow:
              vibe === "healthy"
                ? [
                    `0 0 22px ${from}33`,
                    `0 0 32px ${from}55`,
                    `0 0 22px ${from}33`,
                  ]
                : vibe === "caution"
                  ? [
                      `0 0 24px ${from}44`,
                      `0 0 30px ${from}55`,
                      `0 0 24px ${from}44`,
                    ]
                  : [
                      `0 0 30px ${from}55`,
                      `0 0 24px ${from}44`,
                      `0 0 30px ${from}55`,
                    ],
          }}
          transition={{
            duration:
              vibe === "healthy" ? 4.2 : vibe === "caution" ? 2.6 : 5.6,
            repeat: Infinity,
            ease: "easeInOut",
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
