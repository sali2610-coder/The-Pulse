"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { NewExpenseButton } from "@/components/dashboard/new-expense-button";
import { SPRING_SOFT } from "@/lib/motion-tokens";

/**
 * Auto-hiding floating CTA dock.
 *
 * Replaces the previous in-grid `sticky bottom-0` button that floated
 * through the timeline as the user scrolled. New behavior:
 *
 *   • Fixed-positioned at the bottom, honors safe-area inset
 *   • Visible by default
 *   • Hides on quick scroll-DOWN (user is reading content) — slides
 *     out below the safe area
 *   • Reappears on any scroll-UP gesture > 8px (user paused) — slides
 *     back in via spring
 *   • Backdrop is a subtle gradient mask so the button reads as a
 *     floating dock, not a sheet edge
 *
 * Parent (AppShell main) reserves bottom padding via pb-safe-plus +
 * pb-24 so timeline rows can scroll past the FAB area without being
 * permanently covered.
 */
export function FloatingCTA({ onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastYRef.current = window.scrollY;

    // rAF-throttled scroll handler — at most one state evaluation per
    // frame. Cheap on the main thread even with 60+ scroll events / s
    // emitted by iOS Safari.
    let frame = 0;
    let pending = false;
    const evaluate = () => {
      pending = false;
      const y = window.scrollY;
      const dy = y - lastYRef.current;
      lastYRef.current = y;
      if (y < 80) {
        setVisible(true);
        accumulatedRef.current = 0;
        return;
      }
      accumulatedRef.current += dy;
      if (accumulatedRef.current > 36) {
        setVisible(false);
        accumulatedRef.current = 0;
      } else if (accumulatedRef.current < -8) {
        setVisible(true);
        accumulatedRef.current = 0;
      }
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="fab"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={SPRING_SOFT}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          }}
        >
          {/* Subtle backdrop gradient so the button reads as a dock,
              not a floating chip stuck on top of content. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/85 to-transparent"
          />
          <div className="pointer-events-auto relative w-full max-w-md">
            <NewExpenseButton onClick={onClick} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
