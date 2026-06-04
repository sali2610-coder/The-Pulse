"use client";

// Phase 363 — TimeAmbience driven by the BALANCE VIBE.
//
// Whole canvas reads from the single vibe palette so the background
// reinforces what the ring is saying:
//
//   HEALTHY  → emerald aura, slow upward dot field
//   CAUTION  → gold aura, denser horizontal drift
//   RISK     → red aura, slow downward drift (oxygen-leak)
//
// The aura at the top and the ambient dot canvas share a single
// tone source. State change crossfades over 800ms — premium, not
// abrupt.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

import { VIBE_TONE, type BalanceVibe, type StateTone } from "./state-tone";

export function TimeAmbience({ vibe }: { vibe: BalanceVibe }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const tone = VIBE_TONE[vibe];
  const toneRef = useRef<StateTone>(tone);
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

    type Dot = { x: number; y: number; r: number; v: number; a: number };
    const baseCount = 28;
    const COUNT = baseCount + toneRef.current.particleCount * 2;
    const dots: Dot[] = Array.from({ length: COUNT }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (0.4 + Math.random() * 1.2) * dpr,
      v: (0.08 + Math.random() * 0.18) * dpr,
      a: 0.15 + Math.random() * 0.32,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cur = toneRef.current;
      const mul = cur.particleSpeedMul;
      for (const d of dots) {
        if (cur.drift === "up") {
          d.y -= d.v * mul;
          if (d.y < -2) {
            d.y = canvas.height + 2;
            d.x = Math.random() * canvas.width;
          }
        } else if (cur.drift === "down") {
          d.y += d.v * mul * 0.85;
          if (d.y > canvas.height + 2) {
            d.y = -2;
            d.x = Math.random() * canvas.width;
          }
        } else {
          d.x += d.v * mul * 0.35;
          if (d.x > canvas.width + 2) {
            d.x = -2;
            d.y = Math.random() * canvas.height;
          }
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
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden"
    >
      {/* Top aura — soft state aura behind the ring. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${tone.glow}22 0%, ${tone.glow}0a 38%, transparent 64%)`,
          transition: "background 800ms ease",
        }}
      />
      {/* Lower vignette — adds depth so the ring + chips read on AMOLED black. */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 100%)",
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
