"use client";

// App-shell horizontal pager.
//
// Adds full swipe navigation across the top-level tabs on top of
// the existing TabsList. The tab bar (bottom-of-header row) stays
// as the source of truth; tapping a tab and swiping drive the
// SAME activeIndex, so both surfaces animate through the same
// spring transition.
//
// Behavior:
//   • Horizontal drag on ANY area of the pager pans the track.
//   • Release past 35% of viewport width OR velocity |>500| px/s
//     completes the transition. Otherwise snaps back.
//   • On success: selection haptic + tab-bar sync (parent state).
//   • Every panel stays mounted so state, scroll position and
//     hooks survive tab switches (no re-render cascade).
//   • Non-active panels dim + scale to ~0.96 to give a subtle
//     parallax feel while the current panel bounces in.
//   • Reduced-motion users get a 120ms crossfade instead of a
//     spring so the pager remains usable.
//
// Pager frame is forced dir="ltr" for translation math sanity;
// panel children keep the app's dir="rtl" internally, so panel
// contents behave identically to before.

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
  type MotionValue,
} from "framer-motion";

const SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
  mass: 0.6,
};
const THRESHOLD = 0.35;
const VELOCITY_TRIGGER = 500;

export function TabPager({
  activeIndex,
  onIndexChange,
  onDragSelect,
  children,
}: {
  activeIndex: number;
  onIndexChange: (i: number) => void;
  /** Fired only when a DRAG (not a tab-bar click) completes a
   *  transition. Lets the parent play a selection haptic and skip
   *  double-fires. Optional. */
  onDragSelect?: (i: number) => void;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const panels = Children.toArray(children);
  const count = panels.length;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (width === 0) return;
    const target = -activeIndex * width;
    const controls = animate(
      x,
      target,
      reduced ? { duration: 0.12 } : SPRING,
    );
    return () => controls.stop();
  }, [activeIndex, width, x, reduced]);

  function handleDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (width === 0) return;
    const dx = info.offset.x;
    const vx = info.velocity.x;
    let target = activeIndex;
    // Drag LEFT (dx negative) → next tab index+1 (feels like the
    // next tab entering from the right, standard iOS).
    if (dx < -width * THRESHOLD || vx < -VELOCITY_TRIGGER) {
      target = Math.min(count - 1, activeIndex + 1);
    } else if (dx > width * THRESHOLD || vx > VELOCITY_TRIGGER) {
      target = Math.max(0, activeIndex - 1);
    }
    if (target !== activeIndex) {
      onIndexChange(target);
      onDragSelect?.(target);
    } else {
      // Snap back.
      animate(x, -activeIndex * width, reduced ? { duration: 0.12 } : SPRING);
    }
  }

  return (
    <div
      ref={containerRef}
      className="tp-viewport"
      style={{ direction: "ltr" }}
      role="presentation"
    >
      <motion.div
        className="tp-track"
        style={{
          x,
          width: width * Math.max(1, count),
        }}
        drag={reduced ? false : "x"}
        dragDirectionLock
        dragElastic={0.14}
        dragConstraints={{ left: -width * (count - 1), right: 0 }}
        onDragEnd={handleDragEnd}
      >
        {panels.map((child, i) => (
          <Panel
            key={i}
            width={width}
            x={x}
            index={i}
            isActive={i === activeIndex}
          >
            {child}
          </Panel>
        ))}
      </motion.div>
    </div>
  );
}

function Panel({
  width,
  x,
  index,
  isActive,
  children,
}: {
  width: number;
  x: MotionValue<number>;
  index: number;
  isActive: boolean;
  children: React.ReactNode;
}) {
  // Distance from active panel, normalized to [0, 1+]. When active
  // → 0 (full opacity, scale 1). Neighboring panels dim + scale
  // down for parallax depth.
  const distance = useTransform(x, (v) => {
    if (width === 0) return 0;
    return Math.abs(v + index * width) / width;
  });
  const scale = useTransform(distance, (d) => Math.max(0.96, 1 - d * 0.04));
  const opacity = useTransform(distance, (d) => Math.max(0.32, 1 - d * 0.7));
  const filter = useTransform(distance, (d) =>
    d > 0.02 ? `blur(${Math.min(2, d * 1.6)}px)` : "blur(0px)",
  );
  return (
    <motion.div
      className="tp-panel"
      role="tabpanel"
      aria-hidden={!isActive}
      style={{
        width: width || "100%",
        scale,
        opacity,
        filter,
        direction: "rtl",
      }}
    >
      {children}
    </motion.div>
  );
}
