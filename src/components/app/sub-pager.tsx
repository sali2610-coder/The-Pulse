"use client";

// Nested horizontal sub-pager.
//
// Used inside a top-level tab to break its long content into
// short, focused "stations" the user swipes between. Coexists
// with the outer TabPager without gesture collision:
//   • Pointer events are handled with React's synthetic system
//     and stopPropagation → the outer TabPager never sees them
//     while the finger is inside the sub-pager frame.
//   • Intent threshold is smaller (20px) than the outer pager's
//     30px because horizontal room inside a station is limited.
//
// Every sub-screen mounts once and stays mounted so scroll,
// hooks, and store subscriptions don't reset on swipe.

import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { soft as hapticSoft } from "@/lib/haptics";
import { SPRING_SOFT } from "@/lib/motion-tokens";

const THRESHOLD = 0.32;
const VELOCITY_TRIGGER = 450;
const INTENT_DISTANCE = 20;

type Station = {
  id: string;
  label: string;
};

export function SubPager({
  stations,
  activeIndex,
  onIndexChange,
  children,
}: {
  stations: Station[];
  activeIndex: number;
  onIndexChange: (i: number) => void;
  children: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const reduced = useReducedMotion();
  const panels = Children.toArray(children);
  const count = panels.length;

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
      reduced ? { duration: 0.12 } : SPRING_SOFT,
    );
    return () => controls.stop();
  }, [activeIndex, width, x, reduced]);

  const gesture = useRef({
    active: false,
    captured: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    baseX: 0,
    lastX: 0,
    lastTime: 0,
  });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = {
      active: true,
      captured: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
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
      if (Math.abs(dx) < INTENT_DISTANCE || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      g.captured = true;
      // Stop the OUTER TabPager from seeing this gesture. React
      // synthetic bubbling honors this immediately.
      e.stopPropagation();
      try {
        viewportRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* iOS Safari sometimes throws — ignore. */
      }
    } else {
      e.stopPropagation();
    }
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
    gesture.current = {
      active: false,
      captured: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      baseX: 0,
      lastX: 0,
      lastTime: 0,
    };
    if (!captured) return;
    const dx = e.clientX - g.startX;
    const dt = Math.max(1, e.timeStamp - g.lastTime);
    const vx = ((e.clientX - g.lastX) / dt) * 1000;
    let target = activeIndex;
    if (dx < -width * THRESHOLD || vx < -VELOCITY_TRIGGER) {
      target = Math.min(count - 1, activeIndex + 1);
    } else if (dx > width * THRESHOLD || vx > VELOCITY_TRIGGER) {
      target = Math.max(0, activeIndex - 1);
    }
    if (target !== activeIndex) {
      hapticSoft();
      onIndexChange(target);
    } else {
      animate(x, -activeIndex * width, reduced ? { duration: 0.12 } : SPRING_SOFT);
    }
  }

  return (
    <div className="sp-wrap" dir="rtl">
      <SubPagerBar
        stations={stations}
        activeIndex={activeIndex}
        onChange={onIndexChange}
      />
      <div
        ref={viewportRef}
        className="sp-viewport"
        style={{ direction: "ltr" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <motion.div
          className="sp-track"
          style={{ x, width: width * Math.max(1, count) }}
        >
          {panels.map((child, i) => (
            <SubPanel
              key={i}
              width={width}
              x={x}
              index={i}
              isActive={i === activeIndex}
            >
              {child}
            </SubPanel>
          ))}
        </motion.div>
      </div>
      <SubPagerDots count={count} activeIndex={activeIndex} />
    </div>
  );
}

function SubPanel({
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
  const opacity = useTransform(distance, (d) => Math.max(0.42, 1 - d * 0.6));
  const scale = useTransform(distance, (d) => Math.max(0.98, 1 - d * 0.02));
  return (
    <motion.div
      className="sp-panel"
      role="tabpanel"
      aria-hidden={!isActive}
      style={{
        width: width || "100%",
        opacity,
        scale,
        direction: "rtl",
      }}
    >
      {children}
    </motion.div>
  );
}

function SubPagerBar({
  stations,
  activeIndex,
  onChange,
}: {
  stations: Station[];
  activeIndex: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="sp-bar" role="tablist" aria-label="תחנות">
      {stations.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          data-active={i === activeIndex}
          className="sp-bar-chip"
          onClick={() => onChange(i)}
          aria-label={s.label}
        >
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function SubPagerDots({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  return (
    <div className="sp-dots" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="sp-dot" data-active={i === activeIndex} />
      ))}
    </div>
  );
}
