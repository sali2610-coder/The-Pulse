/**
 * Sally Design System — Phase 11.
 *
 * Single accent (emerald) + premium gold, both desaturated. Spacing/radius/
 * shadow scales picked so cards can use the "Double-Bezel" pattern:
 * outer shell (bezelOuter) wraps an inner core (bezelInner) with concentric
 * radii calculated from a fixed `padding` delta.
 *
 * Colors are kept in raw hex/rgb here; CSS custom properties live in
 * globals.css and reference these as the source of truth.
 */

export const palette = {
  // Surfaces — graphite, not pure black. Pure #000 is on the AI-tell list.
  ink: {
    900: "#0B0C0F",
    800: "#101216",
    700: "#15181D",
    600: "#1B1F26",
    500: "#262B33",
    400: "#3A4049",
    300: "#5A6170",
    200: "#878E9B",
    100: "#B7BCC6",
    50: "#E4E7EC",
  },
  // Accent: Emerald, ~70% saturation. Replaces the screaming cyan everywhere.
  emerald: {
    500: "#10B981",
    400: "#34D399",
    300: "#6EE7B7",
    glow: "rgba(16, 185, 129, 0.35)",
  },
  // Premium accent — forecast / CFO. Use sparingly.
  gold: {
    500: "#D4AF37",
    400: "#E5C457",
    glow: "rgba(212, 175, 55, 0.30)",
  },
  // Status colors — desaturated.
  status: {
    green: "#34D399",
    yellow: "#F5C451",
    red: "#F87171",
    danger: "#EF4444",
  },
  // Hairlines & dividers (rgba so they layer correctly over any surface).
  line: {
    soft: "rgba(255,255,255,0.06)",
    medium: "rgba(255,255,255,0.10)",
    strong: "rgba(255,255,255,0.16)",
  },
  // Pure white tints used for inner bezel highlights / glass refraction.
  highlight: {
    soft: "rgba(255,255,255,0.04)",
    medium: "rgba(255,255,255,0.08)",
    strong: "rgba(255,255,255,0.12)",
  },
} as const;

/**
 * Spacing scale — 4px base. Use semantic keys at the call site.
 * The premium feel comes from the *macro* values (40, 64, 96).
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  "5xl": 96,
  "6xl": 128,
} as const;

/**
 * Radius scale + the `bezelDelta` constant used by Surface variants
 * to derive concentric inner radii (`outer - bezelDelta * 2 = inner`).
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 28,
  "3xl": 36,
  "4xl": 44,
  pill: 9999,
} as const;

/** Padding used by `bezel-outer` to create the inset that bezel-inner sits in. */
export const bezelPadding = 6;

/**
 * Shadow tokens. `tinted` shadows take a hex/rgba accent so they color-match
 * the surface they sit on. Pure black drops are explicitly avoided.
 */
export const shadow = {
  // Inner highlight — simulates a top-edge bevel under a single light source.
  innerHighlight: "inset 0 1px 0 rgba(255,255,255,0.08)",
  // Soft inset bottom — gives "tray" depth.
  innerDip: "inset 0 -1px 0 rgba(0,0,0,0.4)",
  // Diffusion drop — wide, very soft, low opacity. Premium feel.
  diffusion: "0 30px 60px -40px rgba(0,0,0,0.55)",
  // Tinted drop builder. Pass an accent hex/rgba to tint the shadow.
  tintedDrop: (accent: string) =>
    `inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 60px -38px ${accent}`,
  // Tactile button — subtle, layered.
  button:
    "inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(0,0,0,0.35), 0 8px 24px -12px rgba(0,0,0,0.45)",
  // Magnetic press state — flatter, deeper inset.
  buttonPressed:
    "inset 0 2px 4px rgba(0,0,0,0.35), 0 0px 0px rgba(0,0,0,0)",
  // Spotlight border — used as a CSS-variable driven radial gradient.
  spotlight: (accent: string) =>
    `radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${accent}22, transparent 60%)`,
} as const;

/**
 * Z-index scale. Reserve numbers for systemic layers, never use arbitrary z.
 */
export const z = {
  base: 0,
  raised: 10,
  sticky: 20,
  dock: 30,
  overlay: 40,
  modal: 50,
  toast: 60,
  spotlight: 70,
} as const;

export const tokens = {
  palette,
  spacing,
  radius,
  bezelPadding,
  shadow,
  z,
} as const;

export type Tokens = typeof tokens;
