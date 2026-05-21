// Unified design-system tokens.
//
// Sally has grown ~60 dashboard surfaces. Without a single source of
// truth for elevation, blur, and z-order, every new card invents its
// own values — the visual language drifts. This file consolidates
// the primitives every new surface should pull from. Existing
// components opt in gradually; nothing is forced to migrate now.
//
// Companions:
//   - motion-tokens.ts  → spring physics + ease curves
//   - haptics.ts        → tap / success / warn vocabulary
//   - design-tokens.ts  → brand colors (legacy)
//
// All values are tuned for the "premium fintech utility" feel
// (Apple Wallet, Revolut, Copilot Money). Edits here cascade to
// every consumer — change with care.

// ────────────────────────────────────────────────────────────────────────────
// Z-INDEX SCALE
// One contiguous scale so we never accidentally hide an overlay under a
// dashboard card. Numbers are intentionally sparse so future layers can
// slot in without renumbering.
// ────────────────────────────────────────────────────────────────────────────

export const Z = {
  base: 0,
  raised: 5,
  sticky: 10,
  floating: 20,
  drawer: 30,
  /** Bottom sheets and tabs that pin to a screen edge. */
  sheet: 40,
  /** Backdrop dim for modal/popup. */
  backdrop: 50,
  /** Modal + GlassPopup. */
  popup: 60,
  /** Toasts ride above everything except a system-level alert. */
  toast: 70,
  /** Reserve for irreversible-action prompts. */
  alert: 80,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// BLUR HIERARCHY
// Tailwind-compatible class strings so consumers can plug them straight
// into `className`. Three bands cover everything from a faint card scrim
// to a full overlay.
// ────────────────────────────────────────────────────────────────────────────

export const BLUR = {
  /** Inner card scrim (recent activity, list backgrounds). */
  low: "backdrop-blur-sm",
  /** Floating card body (StatsCards, CashflowSummaryCard). */
  mid: "backdrop-blur-md",
  /** Full-bleed surface (settings tab, modal). */
  high: "backdrop-blur-lg",
  /** Glass capsule (GlassPopup, ConfirmationSheet). */
  capsule: "backdrop-blur-2xl backdrop-saturate-150",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// ELEVATION / SHADOW SCALE
// Drop-shadow tokens in raw CSS shadow form so consumers can compose
// them into Tailwind `shadow-[...]` brackets. Tuned to match the dark
// theme — every shadow has a subtle neon glow component so cards
// feel "lit" rather than dropped onto a flat background.
// ────────────────────────────────────────────────────────────────────────────

export const ELEVATION = {
  none: "none",
  /** Faint card lift — chips, pills. */
  xs: "0_2px_6px_-1px_rgba(0,0,0,0.40)",
  /** Standard card lift. */
  sm: "0_8px_18px_-8px_rgba(0,0,0,0.55)",
  /** Floating glass card (capsule popup). */
  md: "0_18px_56px_-18px_rgba(0,229,255,0.22),0_36px_90px_-30px_rgba(0,0,0,0.70)",
  /** Modal / hero-level lift. */
  lg: "0_24px_64px_-22px_rgba(0,229,255,0.24),0_44px_120px_-36px_rgba(0,0,0,0.75)",
  /** Inner highlight for glass surfaces — pair with one of the above. */
  innerHighlight: "inset_0_1px_0_rgba(255,255,255,0.10)",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// SAFE-AREA TOKENS
// Pre-computed CSS expressions so consumers don't have to remember the
// exact `env(safe-area-inset-*, fallback)` syntax. Tuned for iPhone
// standalone PWA where the notch + home indicator are the two clip
// risks.
// ────────────────────────────────────────────────────────────────────────────

export const SAFE_AREA = {
  /** Top inset with a comfortable 0.5rem fallback. Use for floating
   *  cards anchored near the Dynamic Island. */
  top: "max(env(safe-area-inset-top), 0.5rem)",
  /** Bottom inset with a 0.875rem fallback. Use for the last action
   *  row in a sheet so it never clips under the home indicator. */
  bottom: "max(env(safe-area-inset-bottom), 0.875rem)",
  /** Combined max-height calc for popups that should never exceed
   *  the visible viewport. */
  viewportHeight:
    "calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem)",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// TOUCH TARGET
// iOS HIG minimum is 44pt; we use a slightly larger comfort target to
// account for thumb reach on iPhone Plus / Pro Max sizes.
// ────────────────────────────────────────────────────────────────────────────

export const TOUCH_TARGET = {
  /** Minimum tap surface — buttons, chips. */
  min: 44,
  /** Comfortable tap surface — primary CTAs. */
  comfort: 48,
} as const;

// Single re-export surface so consumers can `import { tokens } from
// "@/lib/design-system"` if they prefer one binding over four named
// imports.
export const tokens = {
  Z,
  BLUR,
  ELEVATION,
  SAFE_AREA,
  TOUCH_TARGET,
};
