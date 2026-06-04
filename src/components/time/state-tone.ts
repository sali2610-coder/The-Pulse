// Phase 361 — Single source of truth for the TimeScreen state palette.
//
// All visual surfaces (ring stroke, ambience gradient, particles,
// stability badge, balance number tint) read tones from here. One
// place to tune the emotional language of the screen.
//
// Mapping engine bands (5) → user-facing 4-state vocabulary:
//
//   safe  → emerald  (Stable)
//   steady→ emerald  (Stable, slightly cooler tint)
//   watch → warm gold (Caution)
//   risk  → orange   (Tight)
//   danger→ deep red (Risk)
//
// Each band ships:
//   • from / to        — gradient stops for the ring stroke
//   • glow             — outer halo hex
//   • particle         — particle color tint
//   • numberTint       — applied to hero balance figure
//   • textShadow       — soft glow under the balance figure
//   • particleSpeed    — slow → fast = calmer → tenser
//   • particleCount    — visible density inside the ring

import type { ForecastHealth } from "@/lib/forecast-health";

export type StateTone = {
  from: string;
  to: string;
  glow: string;
  particle: string;
  numberTint: string;
  textShadow: string;
  particleSpeedMul: number;
  particleCount: number;
};

const EMERALD: StateTone = {
  from: "#34D399",
  to: "#6EE7B7",
  glow: "#34D399",
  particle: "rgba(110,231,183,0.55)",
  numberTint: "#F2FFFB",
  textShadow: "0 0 24px rgba(52,211,153,0.28)",
  particleSpeedMul: 0.7,
  particleCount: 6,
};

const EMERALD_COOL: StateTone = {
  ...EMERALD,
  from: "#34D399",
  to: "#9DECC9",
  glow: "#34D399",
  particleSpeedMul: 0.85,
};

const CAUTION_GOLD: StateTone = {
  from: "#D4AF37",
  to: "#F6D970",
  glow: "#D4AF37",
  particle: "rgba(246,217,112,0.55)",
  numberTint: "#FFF7DA",
  textShadow: "0 0 26px rgba(212,175,55,0.34)",
  particleSpeedMul: 1.05,
  particleCount: 7,
};

const TIGHT_ORANGE: StateTone = {
  from: "#FB923C",
  to: "#F59E0B",
  glow: "#FB923C",
  particle: "rgba(251,146,60,0.55)",
  numberTint: "#FFEAD0",
  textShadow: "0 0 30px rgba(251,146,60,0.42)",
  particleSpeedMul: 1.4,
  particleCount: 9,
};

const RISK_RED: StateTone = {
  from: "#F87171",
  to: "#B91C1C",
  glow: "#F87171",
  particle: "rgba(248,113,113,0.6)",
  numberTint: "#FFDADA",
  textShadow: "0 0 34px rgba(248,113,113,0.52)",
  particleSpeedMul: 1.75,
  particleCount: 10,
};

export const STATE_TONE: Record<ForecastHealth["band"], StateTone> = {
  safe: EMERALD,
  steady: EMERALD_COOL,
  watch: CAUTION_GOLD,
  risk: TIGHT_ORANGE,
  danger: RISK_RED,
};

/** 4-state public vocabulary. Used by StabilityIndex + ambient
 *  tooling that wants the visible name rather than the engine band. */
export const PUBLIC_STATE: Record<ForecastHealth["band"], string> = {
  safe: "יציב",
  steady: "יציב",
  watch: "תשומת לב",
  risk: "מצומצם",
  danger: "סיכון",
};
