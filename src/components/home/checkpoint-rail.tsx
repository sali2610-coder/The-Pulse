"use client";

// Home v2 · Checkpoint rail.
//
// LIVE cell has 2× visual priority (gold-soft eyebrow, 22pt amount,
// gold hairline shelf, gold dot). Other cells sit quiet at 15pt ink-3.
// Tap non-LIVE → cell elevates for 3s. Tap LIVE → opens sheet.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Eyebrow, GlassCard, HairlineShelf } from "./primitives";
import type { HomeCheckpoint, HomeData } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ELEVATE_HOLD_MS = 3000;

function toneColor(state: HomeCheckpoint["state"]): string {
  if (state === "danger") return "var(--sally-danger)";
  if (state === "watch") return "var(--sally-watch)";
  return "var(--sally-safe)";
}

export function CheckpointRail({
  data,
  onLiveTap,
  onCheckpointTap,
}: {
  data: HomeData;
  onLiveTap: () => void;
  onCheckpointTap: (cp: HomeCheckpoint) => void;
}) {
  const [elevatedKey, setElevatedKey] = useState<HomeCheckpoint["key"] | null>(
    null,
  );
  const reduced = useReducedMotion();

  useEffect(() => {
    if (elevatedKey === null || elevatedKey === "live") return;
    const t = window.setTimeout(() => setElevatedKey(null), ELEVATE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [elevatedKey]);

  const cps = data.checkpoints;
  if (cps.length === 0) return null;

  return (
    <GlassCard variant="shelf" className="sally-checkpoint-rail">
      <div className="sally-checkpoint-grid" role="list">
        {cps.map((cp) => {
          const isLive = cp.key === "live";
          const isElevated =
            isLive || elevatedKey === cp.key;
          const amountFontSize = isElevated ? 22 : 15;
          const eyebrowAccent = isLive || isElevated;
          const meta =
            isLive
              ? "עכשיו"
              : cp.daysUntil === 0
                ? "היום"
                : `+${cp.daysUntil} ימים`;
          return (
            <motion.button
              key={cp.key}
              type="button"
              role="listitem"
              className="sally-checkpoint-cell"
              data-aurora-live={isLive ? "true" : "false"}
              data-aurora-elevated={isElevated ? "true" : "false"}
              onClick={() => {
                if (isLive) {
                  onLiveTap();
                  return;
                }
                if (elevatedKey === cp.key) {
                  onCheckpointTap(cp);
                  return;
                }
                setElevatedKey(cp.key);
              }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              aria-label={`${cp.label} ${ILS.format(cp.amount)}`}
            >
              <Eyebrow accent={eyebrowAccent}>{cp.label}</Eyebrow>
              <motion.span
                dir="ltr"
                className="sally-checkpoint-amount"
                animate={{ fontSize: amountFontSize }}
                transition={{
                  duration: reduced ? 0.12 : 0.24,
                  ease: [0.32, 0.72, 0, 1],
                }}
                data-aurora-tone={
                  cp.amount < 0 ? "danger" : isLive ? "gold" : "ink"
                }
              >
                {cp.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(cp.amount))}
              </motion.span>
              {isElevated ? (
                <HairlineShelf width={40} className="sally-checkpoint-shelf" />
              ) : (
                <span aria-hidden className="sally-checkpoint-shelf-spacer" />
              )}
              <span className="sally-checkpoint-meta">{meta}</span>
              <span
                aria-hidden
                className="sally-checkpoint-dot"
                data-aurora-visible={isElevated ? "true" : "false"}
                style={{ background: toneColor(cp.state) }}
              />
            </motion.button>
          );
        })}
      </div>
    </GlassCard>
  );
}
