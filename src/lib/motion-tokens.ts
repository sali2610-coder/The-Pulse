// Unified motion vocabulary for the app. Every Framer Motion call
// should pull spring physics + ease curves from here so transitions
// feel like one product, not 30 components with bespoke physics.
//
// The two spring categories cover 95% of needs:
//   - SPRING_SOFT   → big surfaces (sheets, popups, page transitions)
//                      damping 30, stiffness 320, mass 0.75
//   - SPRING_SHARP  → small UI affordances (toggle knobs, chips,
//                      tap-state scale)
//                      damping 26, stiffness 480, mass 0.5
//
// Two ease curves for tween-based animations (height collapses,
// opacity fades, color shifts):
//   - EASE_OUT_EXPO → entrance, reveal, expand
//   - EASE_IN_OUT   → state changes that don't need an explicit
//                      "settling" feel

import type { Transition } from "framer-motion";

export const SPRING_SOFT: Transition = {
  type: "spring",
  damping: 30,
  stiffness: 320,
  mass: 0.75,
};

export const SPRING_SHARP: Transition = {
  type: "spring",
  damping: 26,
  stiffness: 480,
  mass: 0.5,
};

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as [number, number, number, number];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as [number, number, number, number];

export const FADE_IN: Transition = {
  duration: 0.3,
  ease: EASE_OUT_EXPO,
};

export const FADE_QUICK: Transition = {
  duration: 0.18,
  ease: EASE_OUT_EXPO,
};

/** Stagger constants for list reveals (RecentActivity, transaction
 *  drilldown, cashflow timeline expansions). */
export const STAGGER_TIGHT = 0.035;
export const STAGGER_LOOSE = 0.06;

/** Bouncier spring for "promote to foreground" affordances (toast
 *  pop-in, drilldown chip expand). Slightly under-damped so the user
 *  registers the state change without cartoonish overshoot. */
export const SPRING_BOUNCE: Transition = {
  type: "spring",
  damping: 18,
  stiffness: 360,
  mass: 0.55,
};

/** Shared "live tile" micro-interactions. Apply via whileHover /
 *  whileTap on any motion.div that represents a tappable card so
 *  every surface in the dashboard feels alive in the same way. */
export const CARD_HOVER = { y: -1 } as const;
export const CARD_TAP = { scale: 0.985 } as const;

/** Reduced-motion fallback transition. Pair with useReducedMotion()
 *  from framer-motion to swap any non-essential animation out. */
export const REDUCED: Transition = { duration: 0 };

/** List-reveal helper. Children stamp in with a stagger; the parent
 *  fade stays fast so the dashboard's "calm reveal" tone is preserved.
 *  index is clamped at 8 so long lists don't take forever to settle. */
export function listReveal(
  index: number,
  tight = STAGGER_TIGHT,
): Transition {
  return {
    delay: Math.min(index, 8) * tight,
    duration: 0.28,
    ease: EASE_OUT_EXPO,
  };
}
