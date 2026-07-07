"use client";

// App-shell horizontal pager.
//
// Adds full swipe navigation across the top-level tabs on top of
// the existing TabsList. The tab bar (bottom-of-header row) stays
// as the source of truth; tapping a tab and swiping drive the
// SAME activeIndex, so both surfaces animate through the same
// spring transition.
//
// Gesture handling: raw pointer events, not framer-motion drag/pan.
// Both `drag` and `onPan` in framer call setPointerCapture on
// pointer-down — which redirects every subsequent pointerup back
// to the pager and blocks every nested tap on Settings rows, form
// fields, and buttons. Instead, we track pointer coordinates on
// the viewport and only call setPointerCapture AFTER the user has
// confirmed horizontal intent (>= 8px horizontally AND horizontal
// dominant over vertical). Below the threshold, native click
// bubbles up untouched, so every nested button receives its
// onClick natively.

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
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
// Distance the finger must travel horizontally BEFORE the pager
// starts tracking a swipe. Kept high (30px) so ambiguous
// diagonal gestures never win — nested taps and vertical scrolls
// on scroll-heavy panels (Settings shell) always pass through.
const INTENT_DISTANCE = 30;

type GestureState = {
  active: boolean;
  captured: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  startTime: number;
  baseX: number;
  lastX: number;
  lastTime: number;
};

const initialGesture = (): GestureState => ({
  active: false,
  captured: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  baseX: 0,
  lastX: 0,
  lastTime: 0,
});

export function TabPager({
  activeIndex,
  onIndexChange,
  onDragSelect,
  gestureEnabled = true,
  children,
}: {
  activeIndex: number;
  onIndexChange: (i: number) => void;
  /** Fired only when a DRAG (not a tab-bar click) completes a
   *  transition. Lets the parent play a selection haptic. Optional. */
  onDragSelect?: (i: number) => void;
  /** When false, the pager stops attaching pointer handlers to the
   *  viewport — every touch bubbles straight to the panel content
   *  (no capture, no motion). Used to hard-disable the swipe on
   *  scroll-heavy tabs where accidental capture has caused taps
   *  to feel dead. */
  gestureEnabled?: boolean;
  children: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const panels = Children.toArray(children);
  const count = panels.length;
  const gesture = useRef<GestureState>(initialGesture());

  useLayoutEffect(() => {
    const el = viewportRef.current;
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

  function completeTransition(dx: number, vx: number) {
    let target = activeIndex;
    // Pan LEFT (dx negative) → next tab index+1 (feels like the
    // next tab entering from the right).
    if (dx < -width * THRESHOLD || vx < -VELOCITY_TRIGGER) {
      target = Math.min(count - 1, activeIndex + 1);
    } else if (dx > width * THRESHOLD || vx > VELOCITY_TRIGGER) {
      target = Math.max(0, activeIndex - 1);
    }
    if (target !== activeIndex) {
      onIndexChange(target);
      onDragSelect?.(target);
    } else {
      animate(x, -activeIndex * width, reduced ? { duration: 0.12 } : SPRING);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!gestureEnabled) return;
    // Skip synthetic mouse pointer types when a real touch is
    // active — avoids double-tracking on hybrid devices.
    if (reduced) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = {
      active: true,
      captured: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      baseX: x.get(),
      lastX: e.clientX,
      lastTime: e.timeStamp,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.active || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.captured) {
      // Wait for confirmed horizontal intent — below the threshold
      // the browser still fires native click / vertical scroll.
      if (Math.abs(dx) < INTENT_DISTANCE || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      g.captured = true;
      try {
        viewportRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* iOS Safari may throw on synthetic pointers — ignore. */
      }
    }
    // Elastic clamp at the edges so the pager tugs at the ends.
    const min = -width * (count - 1);
    const max = 0;
    let next = g.baseX + dx;
    if (next > max) next = max + (next - max) * 0.35;
    else if (next < min) next = min + (next - min) * 0.35;
    x.set(next);
    g.lastX = e.clientX;
    g.lastTime = e.timeStamp;
  }

  function endGesture(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.active || e.pointerId !== g.pointerId) return;
    const captured = g.captured;
    if (captured) {
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    gesture.current = initialGesture();
    if (!captured) {
      // Never engaged — this was a tap. Let the native click fall
      // through to the child button.
      return;
    }
    const dx = e.clientX - g.startX;
    // Approximate velocity from the last two samples.
    const dt = Math.max(1, e.timeStamp - g.lastTime);
    const vx = ((e.clientX - g.lastX) / dt) * 1000;
    completeTransition(dx, vx);
  }

  return (
    <div
      ref={viewportRef}
      className="tp-viewport"
      style={{ direction: "ltr" }}
      role="presentation"
      onPointerDown={gestureEnabled ? onPointerDown : undefined}
      onPointerMove={gestureEnabled ? onPointerMove : undefined}
      onPointerUp={gestureEnabled ? endGesture : undefined}
      onPointerCancel={gestureEnabled ? endGesture : undefined}
    >
      <motion.div
        className="tp-track"
        style={{
          x,
          width: width * Math.max(1, count),
        }}
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
