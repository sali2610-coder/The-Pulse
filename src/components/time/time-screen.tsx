"use client";

// Phase 358 — TimeScreen ("זמן" tab + /time route).
//
// Flagship "Where will I be" surface. NOT another card — this is a
// full-screen immersive cockpit. Reads from useTimeEngine (pure
// adapter over existing financial engines) and renders:
//
//   • ProjectionRing   — hero ring with balance + date
//   • StabilityIndex   — animated state pill (5-band)
//   • HorizonRail      — checkpoint chips (Phase B adds drag)
//   • VoiceLine        — present-tense Hebrew sentence (Phase D)
//   • CashflowRiver    — vertical waterfall (Phase C)
//   • DrawerHandle     — pull-up with FutureBalanceExplain (Phase C)
//
// Phase A scope: shell + ring + stability + tappable rail. Drag,
// river, drawer, voice, ambience added in subsequent phases of this
// build.

import { useState } from "react";
import { motion } from "framer-motion";

import { useTimeEngine, type Checkpoint } from "./use-time-engine";
import { ProjectionRing } from "./projection-ring";
import { StabilityIndex } from "./stability-index";
import { HorizonRail } from "./horizon-rail";
import { ScrubSurface } from "./scrub-surface";
import { CashflowRiver } from "./cashflow-river";
import { VoiceLine } from "./voice-line";
import { TimeDrawer } from "./time-drawer";
import { TimeAmbience } from "./time-ambience";
import { vibeFromBalance } from "./state-tone";

export function TimeScreen() {
  const [offset, setOffset] = useState<number | null>(null);
  const frame = useTimeEngine(offset);

  if (!frame.ready) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="size-12 animate-pulse rounded-full bg-white/5" />
      </div>
    );
  }

  if (frame.noAnchors) {
    return <EmptyState />;
  }

  const onPickCheckpoint = (c: Checkpoint) => {
    setOffset(c.offset);
  };

  return (
    <ScrubSurface
      cursorOffset={frame.cursorOffset}
      maxOffset={frame.maxOffset}
      checkpoints={frame.checkpoints}
      onOffset={(o) => setOffset(o)}
    >
      <div className="relative flex flex-col gap-6 pb-32">
        <TimeAmbience vibe={vibeFromBalance(frame.balance)} />

        {/* Phase 359 — bottom vignette adds depth to the ring + chips
           on small phones. Pointer-events disabled so it never
           swallows the scrub gesture. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-5"
        >
          <ProjectionRing
            balance={frame.balance}
            cursorISO={frame.cursorISO}
            health={frame.health}
            cursorOffset={frame.cursorOffset}
            maxOffset={frame.maxOffset}
            checkpoints={frame.checkpoints}
            onPickCheckpoint={onPickCheckpoint}
          />

          <StabilityIndex health={frame.health} balance={frame.balance} />

          <VoiceLine
            health={frame.health}
            balance={frame.balance}
            cursorISO={frame.cursorISO}
            cursorOffset={frame.cursorOffset}
          />

          <HorizonRail
            checkpoints={frame.checkpoints}
            cursorOffset={frame.cursorOffset}
            maxOffset={frame.maxOffset}
            onPick={onPickCheckpoint}
            onCustomOffset={(n) => setOffset(n)}
          />

          <CashflowRiver frame={frame} />
        </motion.div>

        <TimeDrawer offset={frame.cursorOffset} />
      </div>
    </ScrubSurface>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="text-[11px] uppercase tracking-[0.3em] text-gold/80">
        זמן
      </span>
      <h2 className="text-2xl font-light text-foreground">
        עוד אין יתרת בנק
      </h2>
      <p className="max-w-xs text-caption text-muted-foreground">
        כדי לראות איפה תהיה בעוד שבוע, חודש, או ב-10 לחודש — הזן יתרת
        בנק נוכחית בהגדרות → חשבונות.
      </p>
    </div>
  );
}
