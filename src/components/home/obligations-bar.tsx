"use client";

// Home v2 · Obligations bar (this-month lanes).

import { motion, useReducedMotion } from "framer-motion";

import { SectionHeader } from "./primitives";
import type { HomeData } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function ObligationsBar({
  data,
  onOpen,
}: {
  data: HomeData;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const { total, lanes } = data.obligations;
  if (total === 0) {
    return (
      <section className="sally-section">
        <SectionHeader eyebrow={`התחייבויות · ${data.monthLabel}`} />
        <p className="sally-empty-line">אין התחייבויות חודשיות מוגדרות.</p>
      </section>
    );
  }
  return (
    <section className="sally-section">
      <SectionHeader
        eyebrow={`התחייבויות · ${data.monthLabel}`}
        end={
          <span dir="ltr" className="sally-section-end-amount">
            {ILS.format(total)}
          </span>
        }
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label="פתח פירוט התחייבויות"
        className="sally-obl-bar-tap"
      >
        <div className="sally-obl-bar" aria-hidden>
          {lanes.map((lane, i) => (
            <motion.span
              key={lane.key}
              className="sally-obl-seg"
              style={{ background: lane.color }}
              initial={reduced ? { flex: lane.share } : { flex: 0 }}
              animate={{ flex: lane.share }}
              transition={{
                duration: reduced ? 0.12 : 0.5,
                delay: reduced ? 0 : i * 0.05,
                ease: [0.32, 0.72, 0, 1],
              }}
            />
          ))}
        </div>
      </button>
      <ul className="sally-obl-legend">
        {lanes.map((lane) => (
          <li key={lane.key}>
            <span aria-hidden className="sally-legend-dot" style={{ background: lane.color }} />
            <span className="sally-legend-label">{lane.label}</span>
            <span dir="ltr" className="sally-legend-share">
              {PCT.format(lane.share)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
