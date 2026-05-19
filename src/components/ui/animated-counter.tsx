"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";

/**
 * Counts up to `value` with a spring-tuned tween. Lives at module scope
 * so subsequent updates retween from the prior value instead of jumping
 * back to zero. Honors `prefers-reduced-motion` — degrades to plain
 * text instantly.
 */
type Props = {
  value: number;
  /** ms */
  duration?: number;
  /** Mapping function applied to the running tween value before rendering. */
  format?: (v: number) => string;
  className?: string;
  /** When true (default), animate on first render too; pass false to
   *  skip the initial run for hot-loading scenarios. */
  animateInitial?: boolean;
};

export function AnimatedCounter({
  value,
  duration = 700,
  format = (v) => Math.round(v).toString(),
  className,
  animateInitial = true,
}: Props) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(animateInitial ? 0 : value);
  const formatted = useTransform(mv, (v) => format(v));
  const [text, setText] = useState(format(animateInitial ? 0 : value));
  const lastValueRef = useRef<number>(animateInitial ? 0 : value);

  useEffect(() => {
    const unsubscribe = formatted.on("change", setText);
    return () => unsubscribe();
  }, [formatted]);

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      lastValueRef.current = value;
      return;
    }
    const controls = animate(mv, value, {
      duration: duration / 1000,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => {
        lastValueRef.current = value;
      },
    });
    return () => controls.stop();
  }, [value, duration, mv, reduced]);

  return <span className={className}>{text}</span>;
}
