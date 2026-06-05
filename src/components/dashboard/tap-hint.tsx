"use client";

// Phase 384 — small CTA hint shown inside tappable Home cards.
//
// One canonical visual: label "פתח פירוט" + a subtle chevron that
// gently drifts so users notice the card is interactive without
// adding chrome. Reused across cards (Pulse, Daily Budget,
// Financial Health, etc.) so the language stays consistent.

import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

export function TapHint({ label = "פתח פירוט" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70"
      aria-hidden
    >
      {label}
      <motion.span
        animate={{ x: [0, -2, 0] }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="inline-flex"
      >
        <ChevronLeft className="size-3" />
      </motion.span>
    </span>
  );
}
