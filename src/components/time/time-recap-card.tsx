"use client";

// Phase 358 / E — Dashboard recap card.
//
// Slim CTA living on the Home tab. Shows the user the cursor balance
// at the next salary date in a single line and routes them to the
// flagship TimeScreen on tap. Quiet, gold-bordered, premium.

import { motion } from "framer-motion";
import { ChevronLeft, Sparkles } from "lucide-react";

import { useTimeEngine } from "@/components/time/use-time-engine";
import { navigateToTab } from "@/lib/tab-nav";
// Phase 428 — Time tab is sound-free; no haptic on tap.

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

import { VIBE_TONE, VIBE_LABEL, vibeFromBalance } from "./state-tone";

export function TimeRecapCard() {
  // Phase 378 — recap card always opens on LIVE (offset 0). The
  // user wants a live snapshot here; the future-cursor lens lives
  // on the Time screen itself, not on this slim CTA. Passing 0
  // (not null) keeps the Time screen's own default untouched.
  const frame = useTimeEngine(0);

  if (!frame.ready || frame.noAnchors) return null;
  const vibe = vibeFromBalance(frame.balance);
  const tone = VIBE_TONE[vibe].glow;
  const label = VIBE_LABEL[vibe];

  return (
    <motion.button
      type="button"
      onClick={() => {
        navigateToTab("history");
      }}
      whileTap={{ scale: 0.985 }}
      className="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl border border-white/8 p-4 text-right"
      style={{
        background: `linear-gradient(135deg, ${tone}14 0%, transparent 60%)`,
      }}
      aria-label="פתח את זמן — מצב חשבון בעוד ימים"
      dir="rtl"
    >
      <span className="flex items-center justify-center text-muted-foreground">
        <ChevronLeft className="size-4" aria-hidden />
      </span>

      <span className="flex flex-1 flex-col gap-1.5 text-right">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <Sparkles className="size-3" style={{ color: tone }} aria-hidden />
          זמן · תחזית חיה
        </span>
        <span className="flex items-baseline gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[22px] font-light text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {frame.balance < 0 ? "−" : ""}
            {ILS.format(Math.abs(frame.balance))}
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {frame.cursorOffset === 0
              ? "עכשיו · LIVE"
              : `ב-+${frame.cursorOffset} ימים`}
          </span>
        </span>
        <span
          className="text-[11.5px]"
          style={{ color: tone }}
        >
          {label}
        </span>
      </span>
    </motion.button>
  );
}
