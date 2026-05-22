"use client";

// Premium loading hero. Replaces the generic spinner-curtain shown
// during the brief window between sign-in and the first cloud
// hydration pull. Mimics the actual hero layout so the user sees
// structure forming instead of a blank box.
//
// Pure visual — no store reads, no cloud, no side effects.
// Components animate in via Framer + stagger so the curtain
// dismisses smoothly into the real cards.

import { motion } from "framer-motion";

import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

function Shimmer({ className }: { className: string }) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] ${className}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 1.4,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </motion.div>
  );
}

const STAGGER = STAGGER_TIGHT;

export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="טוען נתונים מהענן"
      className="flex flex-col gap-3 pb-32"
    >
      {/* Pulse-bar placeholder — biggest hero element. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      >
        <Shimmer className="h-32 w-full" />
      </motion.div>

      {/* Daily-glance split row. */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: STAGGER, duration: 0.35, ease: EASE_OUT_EXPO }}
        >
          <Shimmer className="h-24 w-full" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: STAGGER * 1.5, duration: 0.35, ease: EASE_OUT_EXPO }}
        >
          <Shimmer className="h-24 w-full" />
        </motion.div>
      </div>

      {/* Three secondary card placeholders. */}
      {[2, 3, 4].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: STAGGER * (i + 1),
            duration: 0.35,
            ease: EASE_OUT_EXPO,
          }}
        >
          <Shimmer className="h-20 w-full" />
        </motion.div>
      ))}

      {/* Loading caption — small, calm, sits under the shimmer stack. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-2 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--neon)]" />
        מסנכרן מהענן
      </motion.div>
    </div>
  );
}
