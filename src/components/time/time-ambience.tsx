"use client";

// Phase 358 / D — TimeAmbience.
//
// Backplate gradient + drifting dot field. Tone shifts with the band.
// Fixed positioning behind the screen content. Honors prefers-
// reduced-motion (renders a static gradient with no particles).

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";

const BAND_TONE: Record<ForecastHealth["band"], string> = {
  safe: "#D4AF37",
  steady: "#00E5FF",
  watch: "#F5C76A",
  risk: "#FF8A65",
  danger: "#F87171",
};

export function TimeAmbience({ band }: { band: ForecastHealth["band"] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const tone = BAND_TONE[band];

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
    const COUNT = 36;
    const dots: Dot[] = Array.from({ length: COUNT }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (0.4 + Math.random() * 1.2) * dpr,
      vy: (0.08 + Math.random() * 0.18) * dpr,
      a: 0.15 + Math.random() * 0.35,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        d.y -= d.vy;
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
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${tone}14 0%, transparent 60%)`,
          transition: "background 600ms ease",
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
