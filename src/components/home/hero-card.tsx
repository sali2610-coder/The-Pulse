"use client";

// Home v2 · Signature Hero.
//
// Radial glow · gold hairline shelf (the wordmark) · 56pt thin
// balance · aurora drift over 28s · one editorial gold sentence.

import { motion, useReducedMotion } from "framer-motion";

import { Eyebrow, GoldSentence, HairlineShelf } from "./primitives";
import { HeroDigitSettle } from "./hero-digit-settle";
import type { HomeData } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function HeroCard({
  data,
  onOpen,
}: {
  data: HomeData;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const balanceLabel = ILS.format(data.live);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label={`יתרה חיה ${balanceLabel}, צפי סוף חודש ${ILS.format(data.eom)}`}
      className="sally-hero"
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <motion.span
        aria-hidden
        className="sally-hero-aurora"
        initial={reduced ? { backgroundPosition: "50% 50%" } : { backgroundPosition: "92% -12%" }}
        animate={
          reduced
            ? { backgroundPosition: "50% 50%" }
            : {
                backgroundPosition: [
                  "92% -12%",
                  "10% 110%",
                  "92% -12%",
                ],
              }
        }
        transition={{
          duration: reduced ? 0.12 : 28,
          ease: "easeInOut",
          repeat: reduced ? 0 : Infinity,
        }}
      />
      <span aria-hidden className="sally-hero-gloss" />

      <div className="sally-hero-inner">
        <div className="sally-hero-eyebrow-row">
          <Eyebrow accent>LIVE · {data.monthLabel}</Eyebrow>
        </div>

        <HeroDigitSettle value={balanceLabel} />

        <HairlineShelf width={88} className="sally-hero-shelf" />

        {data.delta24h.count > 0 ? (
          <span className="sally-hero-delta" dir="ltr">
            {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · {data.delta24h.count} פעולות · 24 שעות
          </span>
        ) : null}

        <div className="sally-hero-grid" role="group" aria-label="מרכזי החודש">
          <div className="sally-hero-cell">
            <Eyebrow>צפי חודש</Eyebrow>
            <span
              dir="ltr"
              className="sally-hero-cell-amount"
              data-aurora-tone={
                data.safetyState === "stress"
                  ? "danger"
                  : data.safetyState === "watch"
                    ? "watch"
                    : "ink"
              }
            >
              {ILS.format(data.eom)}
            </span>
            <span
              className="sally-hero-cell-meta"
              data-aurora-tone={
                data.safetyState === "stress"
                  ? "danger"
                  : data.safetyState === "watch"
                    ? "watch"
                    : "safe"
              }
            >
              {data.safetyLabel}
            </span>
          </div>
          <div className="sally-hero-cell">
            <Eyebrow>יעד</Eyebrow>
            <span dir="ltr" className="sally-hero-cell-amount">
              {data.eomBudget > 0 ? ILS.format(data.eomBudget) : "—"}
            </span>
            <span className="sally-hero-cell-meta">
              {data.eomBudget > 0 ? `${data.budgetUsedPct}% נוצל` : "לא הוגדר"}
            </span>
          </div>
        </div>

        {data.heroSentence ? <GoldSentence>{data.heroSentence}</GoldSentence> : null}
      </div>
    </motion.button>
  );
}
