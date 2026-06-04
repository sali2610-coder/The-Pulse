"use client";

// Phase 360 — HorizonRail (premium chips + custom stepper + edge fades).
//
// Horizontal row of glassy pill-chips. Tap = jump to checkpoint.
// "מותאם" expands an inline day stepper so users can park the cursor
// on any future day without leaving the rail. Edge fades hint at
// scrollable content beyond the visible area.
//
// RTL: chips read right-to-left so "LIVE" sits on the right.

import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Checkpoint } from "./use-time-engine";
import { tap as hapticTap } from "@/lib/haptics";

export function HorizonRail({
  checkpoints,
  cursorOffset,
  maxOffset,
  onPick,
  onCustomOffset,
}: {
  checkpoints: Checkpoint[];
  cursorOffset: number;
  maxOffset: number;
  onPick: (c: Checkpoint) => void;
  onCustomOffset: (n: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [showStartFade, setShowStartFade] = useState(false);
  const [showEndFade, setShowEndFade] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const [hint, setHint] = useState(false);

  // Phase 361 — first-mount scroll hint. A brief pulse on the end
  // fade tells the user "there's more here." Fires once.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const overflows = el.scrollWidth - el.clientWidth > 4;
    if (!overflows) return;
    const t1 = setTimeout(() => setHint(true), 480);
    const t2 = setTimeout(() => setHint(false), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [checkpoints.length]);

  // Phase 360 — edge fades indicate "more available." RTL flips the
  // scrollLeft sign on some engines, so we read raw width math.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) {
        setShowStartFade(false);
        setShowEndFade(false);
        return;
      }
      // In RTL, scrollLeft is 0 at the rightmost (visible) position and
      // negative as user scrolls left in Chrome/WebKit. Normalize.
      const pos = Math.abs(el.scrollLeft);
      setShowStartFade(pos > 4); // user has scrolled away from start
      setShowEndFade(pos < max - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [checkpoints.length]);

  if (checkpoints.length === 0) return null;

  return (
    <nav
      className="relative flex w-full justify-center"
      aria-label="קפיצה מהירה לתאריך"
      dir="rtl"
    >
      <div className="relative w-full max-w-full">
        {/* Edge fades — RTL: "start" (right) and "end" (left). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-full"
          style={{
            background:
              "linear-gradient(270deg, rgba(0,0,0,0.55) 0%, transparent 100%)",
            opacity: showStartFade ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 rounded-l-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, transparent 100%)",
            opacity: showEndFade ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
          animate={
            hint
              ? {
                  boxShadow: [
                    "0 0 0px rgba(212,175,55,0)",
                    "0 0 26px rgba(212,175,55,0.5) inset",
                    "0 0 0px rgba(212,175,55,0)",
                  ],
                }
              : { boxShadow: "0 0 0px rgba(212,175,55,0)" }
          }
          transition={
            hint
              ? { duration: 1.6, repeat: 1, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />

        <div
          ref={scrollerRef}
          className="hide-scrollbar flex gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md"
          style={{ scrollbarWidth: "none" }}
        >
          {checkpoints.map((c) => {
            const active =
              c.kind === "custom"
                ? customMode
                : Math.abs(c.offset - cursorOffset) < 1 && !customMode;
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => {
                  hapticTap();
                  if (c.kind === "custom") {
                    setCustomMode(true);
                    onCustomOffset(cursorOffset);
                    return;
                  }
                  setCustomMode(false);
                  onPick(c);
                }}
                aria-label={`קפיצה ל${c.label}`}
                aria-pressed={active}
                className="relative inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors"
                style={{
                  color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
                  minHeight: 36,
                }}
              >
                {active ? (
                  <motion.span
                    layoutId="rail-active-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
                      boxShadow:
                        "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 22px -6px rgba(212,175,55,0.55)",
                    }}
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  >
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full"
                      animate={{ opacity: [0.0, 0.25, 0.0] }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%)",
                      }}
                    />
                  </motion.span>
                ) : null}
                <span className="relative z-10 whitespace-nowrap">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom stepper — appears under the rail when "מותאם" is on. */}
        {customMode ? (
          <CustomStepper
            value={cursorOffset}
            max={maxOffset}
            onChange={onCustomOffset}
          />
        ) : null}
      </div>
    </nav>
  );
}

function CustomStepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const clamped = Math.max(0, Math.min(max, value));
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="mt-2 flex items-center justify-center gap-3 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[12px] text-foreground/85 backdrop-blur-md"
      role="group"
      aria-label="ימים קדימה"
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.max(0, clamped - 1));
        }}
        className="inline-flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
        aria-label="יום פחות"
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <span className="flex items-baseline gap-1.5 tabular-nums" dir="ltr">
        <span
          data-mono="true"
          className="text-[15px] font-medium text-foreground"
        >
          {clamped}
        </span>
        <span className="text-[10px] text-muted-foreground">ימים</span>
      </span>
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.min(max, clamped + 1));
        }}
        className="inline-flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
        aria-label="יום נוסף"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </motion.div>
  );
}
