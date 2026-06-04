"use client";

// Phase 358 / B — ScrubSurface.
//
// Wraps the screen in a horizontal-drag PanHandler. Drag right → time
// flows forward; drag left → backward (RTL convention preserved).
//
// Snaps to the nearest checkpoint when the user releases within a
// gravity radius. Otherwise lands on the nearest day index.
//
// Haptic tap fires on snap. No engine touched.

import { useRef, useState, type ReactNode, type PointerEvent } from "react";

import type { Checkpoint } from "./use-time-engine";
import { success as hapticSuccess } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { playCheckpointTone } from "@/lib/time-chime";

const GRAVITY_PCT = 0.06; // snap if release within 6% of viewport width
const DRAG_DAY_PX = 12; // 12px = 1 day of curve travel

export function ScrubSurface({
  children,
  cursorOffset,
  maxOffset,
  checkpoints,
  onOffset,
}: {
  children: ReactNode;
  cursorOffset: number;
  maxOffset: number;
  checkpoints: Checkpoint[];
  onOffset: (offset: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const lastEmittedRef = useRef(cursorOffset);
  const audioEnabled = useFinanceStore((s) => s.audioEnabled);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Ignore drags that begin inside a button — let the tap-only chip
    // handlers run normally without being eaten by the scrub layer.
    const tag = (e.target as HTMLElement).closest("button, a, input, textarea");
    if (tag) return;
    setDragging(true);
    startXRef.current = e.clientX;
    startOffsetRef.current = cursorOffset;
    lastEmittedRef.current = cursorOffset;
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    // RTL: dragging LEFT (negative dx) should move INTO the future
    // because the rail flows right→left for the user. So we
    // subtract dx from the offset.
    const deltaDays = -dx / DRAG_DAY_PX;
    const raw = startOffsetRef.current + deltaDays;
    const next = Math.max(0, Math.min(maxOffset, Math.round(raw)));
    if (next !== lastEmittedRef.current) {
      lastEmittedRef.current = next;
      onOffset(next);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    ref.current?.releasePointerCapture(e.pointerId);

    // Snap to nearest checkpoint within gravity radius.
    const width = ref.current?.clientWidth ?? 360;
    const gravityDays = Math.max(2, Math.round((width * GRAVITY_PCT) / DRAG_DAY_PX));
    let best: Checkpoint | null = null;
    let bestDist = Infinity;
    for (const c of checkpoints) {
      const d = Math.abs(c.offset - cursorOffset);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best && bestDist <= gravityDays) {
      hapticSuccess();
      if (audioEnabled) playCheckpointTone();
      onOffset(best.offset);
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="touch-pan-y select-none"
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </div>
  );
}
