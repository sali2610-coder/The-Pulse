"use client";

// Phase 432 · AURORA v1 — DigitOdometer v2
//
// Whole-number crossfade with locked baseline (HIG critique #4).
// dir="ltr" enforced on the digit container so numerics render
// left-to-right even when the surrounding page is RTL.
//
// Locked baseline: a hidden <span> mirrors the value (visibility:
// hidden) to reserve the exact width AND baseline, while an
// AnimatePresence layer above performs the cross-fade with
// translateY. Reduced-motion → 120ms opacity crossfade only.
//
// aria-label on the wrapper announces the formatted value to
// screen readers; the visual digits are aria-hidden so SR doesn't
// re-announce on every tick.

import { type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type DigitOdometerProps = {
  /** Pre-formatted value (currency, percent, etc). Rendered as-is. */
  value: string;
  /** Accessible label announced on change. Required for SR usage. */
  ariaLabel?: string;
  /** Optional className for typography hooks (size, color, weight). */
  className?: string;
  style?: CSSProperties;
};

export function DigitOdometer({
  value,
  ariaLabel,
  className,
  style,
}: DigitOdometerProps) {
  const reduced = useReducedMotion();
  return (
    <span
      aria-label={ariaLabel ?? value}
      className={["aurora-odo", className].filter(Boolean).join(" ")}
      dir="ltr"
      style={style}
    >
      {/* Mirror — visibility:hidden, locks width + baseline. */}
      <span className="aurora-odo-mirror" aria-hidden>
        {value}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          aria-hidden
          className="aurora-odo-layer"
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(0.4em)" }
          }
          animate={
            reduced
              ? {
                  opacity: 1,
                  transition: { duration: 0.12, ease: [0.32, 0.72, 0, 1] },
                }
              : {
                  opacity: 1,
                  transform: "translateY(0)",
                  transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] },
                }
          }
          exit={
            reduced
              ? {
                  opacity: 0,
                  transition: { duration: 0.12, ease: [0.32, 0.72, 0, 1] },
                }
              : {
                  opacity: 0,
                  transform: "translateY(-0.4em)",
                  transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
                }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
