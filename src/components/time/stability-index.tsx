"use client";

// Phase 358 — StabilityIndex.
//
// Single-row pill: state word + tiny score. Letter-morphs when the
// band changes. Sits just under the ring.

import { AnimatePresence, motion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";

const BAND_TONE: Record<ForecastHealth["band"], { fg: string; bg: string }> = {
  safe: { fg: "#F6D970", bg: "rgba(212,175,55,0.14)" },
  steady: { fg: "#75F5FF", bg: "rgba(0,229,255,0.12)" },
  watch: { fg: "#F5C76A", bg: "rgba(245,199,106,0.14)" },
  risk: { fg: "#FF8A65", bg: "rgba(255,138,101,0.14)" },
  danger: { fg: "#F87171", bg: "rgba(248,113,113,0.16)" },
};

export function StabilityIndex({ health }: { health: ForecastHealth | null }) {
  if (!health) return null;
  const tone = BAND_TONE[health.band];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={health.band}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22 }}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
          style={{
            color: tone.fg,
            background: tone.bg,
            borderColor: `${tone.fg}33`,
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: tone.fg, boxShadow: `0 0 8px ${tone.fg}` }}
            aria-hidden
          />
          <span className="text-[12.5px] font-medium tracking-wide">
            {health.label}
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
