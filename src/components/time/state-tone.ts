// Phase 363 — Balance-Vibe atmosphere system.
//
// Single source of truth for how the TimeScreen *feels*. The
// projected balance at the cursor determines the visual band:
//
//     balance >  +500   → HEALTHY   (emerald)
//     -500 ≤ b ≤ +500   → CAUTION   (warm gold)
//     balance <  -500   → RISK      (deep red)
//
// One signal, three vibes. Every ring/ambience/particle/number
// surface reads its tone + behavior from this map. Engine math
// untouched — this is purely the presentation layer.
//
// Each vibe ships:
//
//   from/to/glow         gradient + halo tone
//   particle             color used inside the ring
//   numberTint           tint for the hero balance figure
//   textShadow           soft glow under the hero number
//   particleCount        density inside the ring
//   particleSpeedMul     ambient pacing multiplier
//   drift                "up" | "calm" | "down" — particle vector
//   shimmer              whether to flash a soft pass every N seconds
//   sparkle              whether to ping tiny celebration motes

import type { ForecastHealth } from "@/lib/forecast-health";

export type BalanceVibe = "healthy" | "caution" | "risk";

export type StateTone = {
  from: string;
  to: string;
  glow: string;
  particle: string;
  numberTint: string;
  textShadow: string;
  particleCount: number;
  particleSpeedMul: number;
  /** Direction vector for the in-ring particle field. */
  drift: "up" | "calm" | "down";
  /** Optional periodic shimmer pass (caution-only — financial yellow). */
  shimmer: boolean;
  /** Tiny celebration bursts inside the ring (healthy-only). */
  sparkle: boolean;
};

const HEALTHY: StateTone = {
  from: "#34D399",
  to: "#6EE7B7",
  glow: "#34D399",
  particle: "rgba(110,231,183,0.55)",
  numberTint: "#E9FFF6",
  textShadow: "0 0 28px rgba(52,211,153,0.34)",
  particleCount: 7,
  particleSpeedMul: 0.65,
  drift: "up",
  shimmer: false,
  sparkle: true,
};

const CAUTION: StateTone = {
  from: "#D4AF37",
  to: "#F6D970",
  glow: "#D4AF37",
  particle: "rgba(246,217,112,0.58)",
  numberTint: "#FFF6D6",
  textShadow: "0 0 30px rgba(212,175,55,0.42)",
  particleCount: 8,
  particleSpeedMul: 1.1,
  drift: "calm",
  shimmer: true,
  sparkle: false,
};

const RISK: StateTone = {
  from: "#F87171",
  to: "#B91C1C",
  glow: "#F87171",
  particle: "rgba(248,113,113,0.62)",
  numberTint: "#FFDDDD",
  textShadow: "0 0 36px rgba(248,113,113,0.52)",
  particleCount: 11,
  particleSpeedMul: 1.45,
  drift: "down",
  shimmer: false,
  sparkle: false,
};

/** Map a balance amount to one of the three vibes. */
export function vibeFromBalance(balance: number): BalanceVibe {
  if (balance > 500) return "healthy";
  if (balance < -500) return "risk";
  return "caution";
}

export const VIBE_TONE: Record<BalanceVibe, StateTone> = {
  healthy: HEALTHY,
  caution: CAUTION,
  risk: RISK,
};

/** Visible label tied to the vibe. Used by the stability badge so
 *  the colour and the word always tell the same story. */
export const VIBE_LABEL: Record<BalanceVibe, string> = {
  healthy: "יציב",
  caution: "תשומת לב",
  risk: "סיכון",
};

// ─── Legacy compatibility ─────────────────────────────────────────
// Some surfaces (StabilityIndex chip rendering legacy code) still
// import STATE_TONE keyed by the engine band. Keep that alias alive
// by mapping each engine band to a sensible vibe tone — but new code
// should prefer VIBE_TONE + vibeFromBalance().
export const STATE_TONE: Record<ForecastHealth["band"], StateTone> = {
  safe: HEALTHY,
  steady: HEALTHY,
  watch: CAUTION,
  risk: RISK,
  danger: RISK,
};

export const PUBLIC_STATE: Record<ForecastHealth["band"], string> = {
  safe: "יציב",
  steady: "יציב",
  watch: "תשומת לב",
  risk: "סיכון",
  danger: "סיכון",
};
