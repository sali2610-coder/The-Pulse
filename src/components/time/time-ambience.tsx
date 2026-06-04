"use client";

// Phase 361 — TimeAmbience.
//
// Backplate gradient + drifting dot field. Reads the centralised
// STATE_TONE palette so the whole screen breathes the same color
// language. Particle density + speed scale with the band so the
// atmosphere reads calm or tense without text.
//
// Honors prefers-reduced-motion (static gradient, no particles).

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";
import { STATE_TONE } from "./state-tone";

export function TimeAmbience({ band }: { band: ForecastHealth["band"] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const tone = STATE_TONE[band];
  const toneRef = useRef(tone);
  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    type Dot = { x: number; y: number; r: number; vy: number; a: number };
    // Density scales with band tone (calmer → fewer dots).
    const baseCount = 28;
    const COUNT = Math.round(baseCount + toneRef.current.particleCount * 2);
    const dots: Dot[] = Array.from({ length: COUNT }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (0.4 + Math.random() * 1.2) * dpr,
      vy: (0.08 + Math.random() * 0.18) * dpr,
      a: 0.15 + Math.random() * 0.32,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mul = toneRef.current.particleSpeedMul;
      for (const d of dots) {
        d.y -= d.vy * mul;
        if (d.y < -2) {
          d.y = canvas.height + 2;
          d.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${d.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${tone.glow}1A 0%, ${tone.glow}07 38%, transparent 62%)`,
          transition: "background 640ms ease",
        }}
      />
      {!reduced ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full"
          style={{ opacity: 0.55 }}
        />
      ) : null}
    </div>
  );
}
