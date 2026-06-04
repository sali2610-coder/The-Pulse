"use client";

// Phase 359 — StabilityIndex (premium polish).
//
// Single glass pill: state word + tiny score subscript. The visible
// label maps the engine's 5 bands to the 4 user-facing names the PO
// asked for (Stable / Caution / Tight / Risk) — done at the
// presentation layer only; the engine output is left untouched so
// every other reader stays consistent.

import { AnimatePresence, motion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";
import { STATE_TONE, PUBLIC_STATE } from "./state-tone";

export function StabilityIndex({ health }: { health: ForecastHealth | null }) {
  if (!health) return null;
  const stateTone = STATE_TONE[health.band];
  const tone = {
    fg: stateTone.to,
    bg: `${stateTone.glow}26`,
  };
  const label = PUBLIC_STATE[health.band];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5"
          style={{
            color: tone.fg,
            background: tone.bg,
            borderColor: `${tone.fg}33`,
            boxShadow: `0 0 22px -8px ${tone.fg}66, 0 1px 0 rgba(255,255,255,0.04) inset`,
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.span
            className="size-1.5 rounded-full"
            style={{ background: tone.fg }}
            animate={{
              opacity: [0.6, 1, 0.6],
              boxShadow: [
                `0 0 4px ${tone.fg}88`,
                `0 0 12px ${tone.fg}cc`,
                `0 0 4px ${tone.fg}88`,
              ],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
          <span className="text-[12.5px] font-medium tracking-wide">
            {label}
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[10.5px] opacity-70"
            aria-label={`ציון ${health.score}`}
          >
            {Math.round(health.score)}
          </span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
