"use client";

// Time · animated number.
//
// Smoothly interpolates from previous value to new value using a
// Framer spring on a motion value. Formatter is caller-provided so
// currency / percent / plain formatting all share the same easing.

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (n) => format(n));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: reduced ? 0.1 : 0.7,
      ease: [0.32, 0.72, 0, 1],
    });
    return () => controls.stop();
  }, [mv, value, reduced]);

  return <motion.span className={className}>{text}</motion.span>;
}
