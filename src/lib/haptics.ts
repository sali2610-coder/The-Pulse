// Lightweight haptic palette. Web Vibration API only fires on Android Chrome
// + supported PWAs — silent no-op everywhere else (iOS Safari included). We
// don't gate per-platform; the API itself is the gate.
//
// All exports respect `prefers-reduced-motion: reduce` so users who opt out
// of motion in OS settings get a quieter device.

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (prefersReducedMotion()) return;
  navigator.vibrate?.(pattern);
}

/** Light, single bump — taps on chips, tiles, picker selections. */
export function tap(): void {
  vibrate(15);
}

/** Even lighter — for "in-place" feedback when the action is mostly visual
 *  (carousel snap, slider tick). */
export function soft(): void {
  vibrate(8);
}

/** Multi-pulse success — saving an entry, confirming a charge. */
export function success(): void {
  vibrate([20, 40, 30]);
}

/** Triple short — used for destructive confirmations or "are you sure?"
 *  prompts so the user can feel the difference. */
export function warn(): void {
  vibrate([30, 30, 30]);
}

/** Heavy single pulse — page-level errors, irreversible actions. */
export function heavy(): void {
  vibrate(40);
}
