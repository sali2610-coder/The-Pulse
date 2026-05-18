"use client";

import * as React from "react";
import { motion, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { tap as hapticTap } from "@/lib/haptics";

// Reusable wrapper for "this whole card is tappable" dashboard tiles.
// Standardizes: hover lift, press-down scale, focus ring, haptic on tap,
// optional drill-down chevron, accessible role/keyboard activation.
//
// Pure presentation — no business logic. The single financial snapshot
// stays in buildFinancialSnapshot; this component only opens drill-downs
// (BottomSheet, Dialog) that READ from that snapshot.

type Variant = "glass" | "solid" | "outline";

type Props = MotionProps & {
  onActivate?: () => void;
  /** Visual style. `glass` matches existing dashboard surfaces. */
  variant?: Variant;
  /** Disable interaction styles. Card still renders. */
  inert?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Accessible label for screen readers when onActivate is provided. */
  ariaLabel?: string;
};

const VARIANT_CLASS: Record<Variant, string> = {
  glass: "glass-card",
  solid: "bg-surface/60 border border-white/8",
  outline: "border border-white/12 bg-transparent",
};

export function InteractiveCard({
  onActivate,
  variant = "glass",
  inert,
  className,
  children,
  ariaLabel,
  ...motionProps
}: Props) {
  const interactive = Boolean(onActivate) && !inert;

  const handleActivate = React.useCallback(() => {
    if (!interactive || !onActivate) return;
    hapticTap();
    onActivate();
  }, [interactive, onActivate]);

  return (
    <motion.div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onClick={interactive ? handleActivate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleActivate();
              }
            }
          : undefined
      }
      whileTap={interactive ? { scale: 0.985 } : undefined}
      whileHover={interactive ? { y: -1 } : undefined}
      {...motionProps}
      className={cn(
        "relative overflow-hidden rounded-3xl p-5 transition-shadow",
        VARIANT_CLASS[variant],
        interactive &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
