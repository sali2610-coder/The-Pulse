"use client";

// Home v2 · Hero balance micro-interaction.
//
// Signature "Digit Settle": every glyph of the balance crossfades in
// from opacity 0.28 with a 4px y-lift, staggered 40ms right-to-left
// (Hebrew reading order). Fires on mount and on value change > ₪1.
// Reduced-motion collapses to instant opacity 1.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function HeroDigitSettle({ value }: { value: string }) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const lastValue = useRef<string>(value);

  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      setTick((t) => t + 1);
    }
  }, [value]);

  const glyphs = useMemo(() => Array.from(value), [value]);
  // Stagger right-to-left in Hebrew: index 0 is left-most glyph but
  // visual read order runs the other way. We stagger from the end.
  const total = glyphs.length;

  return (
    <span dir="ltr" className="sally-hero-balance">
      <AnimatePresence mode="popLayout" initial>
        <motion.span
          key={`digits-${tick}`}
          className="sally-hero-balance-line"
          aria-hidden
        >
          {glyphs.map((g, i) => {
            const orderFromEnd = total - 1 - i;
            const delay = reduced ? 0 : orderFromEnd * 0.04;
            return (
              <motion.span
                key={`${g}-${i}-${tick}`}
                className="sally-hero-balance-glyph"
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0.28, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0.12 : 0.32,
                  delay,
                  ease: [0.32, 0.72, 0, 1],
                }}
              >
                {g}
              </motion.span>
            );
          })}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{value}</span>
    </span>
  );
}
