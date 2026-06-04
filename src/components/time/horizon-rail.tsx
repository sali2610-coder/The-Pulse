"use client";

// Phase 359 — HorizonRail (premium chips).
//
// Horizontal row of glassy pill-chips. Tap = jump to checkpoint.
// Active chip morphs via shared layoutId so the selection slides
// across the rail. Bigger tap targets (44pt min), glass border,
// gold-tinted active state.
//
// RTL: chips read right-to-left so "עכשיו" sits on the right.

import { motion } from "framer-motion";

import type { Checkpoint } from "./use-time-engine";
import { tap as hapticTap } from "@/lib/haptics";

export function HorizonRail({
  checkpoints,
  cursorOffset,
  onPick,
}: {
  checkpoints: Checkpoint[];
  cursorOffset: number;
  onPick: (c: Checkpoint) => void;
}) {
  if (checkpoints.length === 0) return null;

  return (
    <nav
      className="flex w-full justify-center"
      aria-label="קפיצה מהירה לתאריך"
      dir="rtl"
    >
      <div
        className="flex max-w-full gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur-md"
        style={{ scrollbarWidth: "none" }}
      >
        {checkpoints.map((c) => {
          const active = Math.abs(c.offset - cursorOffset) < 1;
          return (
            <button
              key={c.kind}
              type="button"
              onClick={() => {
                hapticTap();
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
                      "0 1px 0 rgba(255,255,255,0.35) inset, 0 6px 18px -6px rgba(212,175,55,0.55)",
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              ) : null}
              <span className="relative z-10 whitespace-nowrap">
                {c.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
