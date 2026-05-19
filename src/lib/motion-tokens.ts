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
