"use client";

// Phase 358 / B — HorizonRail.
//
// Horizontal timeline showing every checkpoint as a dot, an active
// "you are here" pulse, and a gold thread connecting them. Each
// checkpoint chip is tappable for users who prefer not to drag.
//
// RTL: rail reads right-to-left. "עכשיו" sits on the right, future
// dates flow left. The motion still feels "forward = forward."

import { motion } from "framer-motion";

import type { Checkpoint } from "./use-time-engine";
import { tap as hapticTap } from "@/lib/haptics";

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

export function HorizonRail({
  checkpoints,
  cursorOffset,
  maxOffset,
  onPick,
}: {
  checkpoints: Checkpoint[];
  cursorOffset: number;
  maxOffset: number;
  onPick: (c: Checkpoint) => void;
}) {
  if (checkpoints.length === 0) return null;

  // Cursor's % position on the rail (0 = start = "now").
  const cursorPct = Math.max(
    0,
    Math.min(100, (cursorOffset / Math.max(1, maxOffset)) * 100),
  );

  return (
    <div className="flex flex-col gap-2 px-1" dir="rtl">
      <div className="relative h-9">
        {/* Rail base */}
        <div
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.04) 100%)",
          }}
        />
        {/* Active thread up to cursor (RTL so right edge = 0%). */}
        <motion.div
          aria-hidden
          className="absolute top-1/2 right-0 h-[2px] -translate-y-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(270deg, rgba(212,175,55,0.95) 0%, rgba(0,229,255,0.55) 100%)",
            boxShadow: "0 0 12px rgba(212,175,55,0.35)",
          }}
          initial={false}
          animate={{ width: `${cursorPct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />

        {/* Checkpoint dots */}
        {checkpoints.map((c) => {
          const pct = (c.offset / Math.max(1, maxOffset)) * 100;
          const isActive = Math.abs(c.offset - cursorOffset) < 1;
          return (
            <button
              key={c.kind}
              type="button"
              onClick={() => {
                hapticTap();
                onPick(c);
              }}
              aria-label={`קפיצה לתאריך: ${c.label}`}
              className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
              style={{ right: `${pct}%`, transform: "translate(50%, -50%)" }}
            >
              <span className="sr-only">{c.label}</span>
              <span
                className="block rounded-full"
                style={{
                  width: isActive ? 12 : 6,
                  height: isActive ? 12 : 6,
                  background: isActive ? "#D4AF37" : "rgba(255,255,255,0.45)",
                  boxShadow: isActive
                    ? "0 0 14px rgba(212,175,55,0.65)"
                    : "none",
                  transition: "all 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Label row */}
      <div className="relative h-5">
        {checkpoints.map((c) => {
          const pct = (c.offset / Math.max(1, maxOffset)) * 100;
          const isActive = Math.abs(c.offset - cursorOffset) < 1;
          const date = c.iso ? new Date(c.iso) : null;
          return (
            <span
              key={`l-${c.kind}`}
              className="absolute top-0 -translate-x-1/2 select-none whitespace-nowrap text-[10px]"
              style={{
                right: `${pct}%`,
                transform: "translateX(50%)",
                color: isActive ? "#D4AF37" : "rgba(255,255,255,0.45)",
              }}
            >
              {c.label === "עכשיו" || c.label === "סוף החודש"
                ? c.label
                : date
                  ? DAY_FMT.format(date)
                  : c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
