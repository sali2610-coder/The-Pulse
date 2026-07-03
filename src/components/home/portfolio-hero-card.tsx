"use client";

// Home v2 · Portfolio Hero standalone card.
//
// UI-only wrapper that renders the approved Portfolio Pro hero
// content at enlarged sizing so it can act as the single dominant
// card at the top of the legacy Home tab. Reads the existing
// useHomeData composition hook — zero engine, store, dialog, or
// business-logic touched. Tap-to-drilldown opens a BottomSheet with
// the same fact list the full Portfolio Pro sheet uses.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { BottomSheet } from "@/components/ui/bottom-sheet";

import { HeroDigitSettle } from "./hero-digit-settle";
import { Eyebrow, HairlineShelf } from "./primitives";
import { useHomeData, type HomeData } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function PortfolioHeroCard() {
  const data = useHomeData();
  const [open, setOpen] = useState(false);
  if (!data.ready) return null;
  return (
    <>
      <PortfolioHeroBody data={data} onOpen={() => setOpen(true)} />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="פירוט יתרה"
      >
        <HeroSheet data={data} />
      </BottomSheet>
    </>
  );
}

function PortfolioHeroBody({
  data,
  onOpen,
}: {
  data: HomeData;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const balanceLabel = ILS.format(data.live);
  const eomTone: "safe" | "watch" | "danger" =
    data.safetyState === "stress"
      ? "danger"
      : data.safetyState === "watch"
        ? "watch"
        : "safe";
  const donutRatio =
    data.eomBudget > 0 ? Math.min(1, data.budgetUsedPct / 100) : 0;
  const safetyMarker = Math.max(
    0.05,
    Math.min(0.95, data.eomBudget > 0 ? data.budgetUsedPct / 100 : 0.5),
  );

  return (
    <motion.article
      className="pro-hero pro-hero-standalone"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`יתרה חיה ${balanceLabel}, צפי סוף חודש ${ILS.format(data.eom)}`}
      onKeyDown={(e) => (e.key === "Enter" ? onOpen() : undefined)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
    >
      <motion.span
        aria-hidden
        className="pro-hero-aurora"
        animate={
          reduced
            ? undefined
            : { backgroundPosition: ["90% -12%", "10% 112%", "90% -12%"] }
        }
        transition={{
          duration: reduced ? 0.1 : 32,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      <span aria-hidden className="pro-hero-gloss" />
      <span aria-hidden className="pro-hero-emboss" />

      <div className="pro-hero-head">
        <div>
          <Eyebrow accent>SALLY · PORTFOLIO</Eyebrow>
          <span className="pro-hero-month">{data.monthLabel}</span>
        </div>
        <span className="pro-hero-status" data-aurora-tone={eomTone}>
          <span aria-hidden className="pro-hero-status-dot" />
          {data.safetyLabel}
        </span>
      </div>

      <div className="pro-hero-columns">
        <div className="pro-hero-left">
          <Eyebrow>יתרה חיה</Eyebrow>
          <div className="pro-hero-balance">
            <HeroDigitSettle value={balanceLabel} />
          </div>
          <HairlineShelf width={140} className="pro-hero-shelf" />
          {data.delta24h.count > 0 ? (
            <span className="pro-hero-delta" dir="ltr">
              {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · {data.delta24h.count} פעולות · 24 שעות
            </span>
          ) : null}
          <div className="pro-hero-next">
            <Eyebrow>הבא בתור</Eyebrow>
            {data.upcoming[0] ? (
              <>
                <span className="pro-hero-next-title">
                  {data.upcoming[0].label}
                </span>
                <span className="pro-hero-next-meta" dir="ltr">
                  {data.upcoming[0].direction === "in" ? "+" : "−"}
                  {ILS.format(data.upcoming[0].amount)} · {data.upcoming[0].daysLabel}
                </span>
              </>
            ) : (
              <span className="pro-hero-next-meta">אין אירועים קרובים</span>
            )}
          </div>
        </div>

        <div className="pro-hero-right">
          <HeroDonut ratio={donutRatio} tone={eomTone} />
          <Eyebrow>סוף חודש</Eyebrow>
          <span dir="ltr" className="pro-hero-eom" data-aurora-tone={eomTone}>
            {ILS.format(data.eom)}
          </span>
          <span className="pro-hero-eom-hint">
            {data.eomBudget > 0
              ? `${PCT.format(data.budgetUsedPct / 100)} · יעד ${ILS.format(data.eomBudget)}`
              : "בלי יעד"}
          </span>
        </div>
      </div>

      <div className="pro-safety-strip" aria-hidden>
        <span className="pro-safety-gradient" />
        <motion.span
          className="pro-safety-marker"
          initial={{ insetInlineStart: 0 }}
          animate={{ insetInlineStart: `${safetyMarker * 100}%` }}
          transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
        />
      </div>
    </motion.article>
  );
}

function HeroDonut({
  ratio,
  tone,
}: {
  ratio: number;
  tone: "safe" | "watch" | "danger";
}) {
  const reduced = useReducedMotion();
  const size = 156;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(circ, circ * ratio));
  const color =
    tone === "danger"
      ? "var(--sally-danger)"
      : tone === "watch"
        ? "var(--sally-watch)"
        : "var(--sally-safe)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="pro-hero-donut"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={circ}
        initial={reduced ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: reduced ? 0.1 : 1, ease: [0.32, 0.72, 0, 1] }}
      />
    </svg>
  );
}

function HeroSheet({ data }: { data: HomeData }) {
  return (
    <div className="pro-sheet-stack">
      <dl className="pro-sheet-list">
        <div className="pro-sheet-row">
          <dt>יתרה חיה</dt>
          <dd>{ILS.format(data.live)}</dd>
        </div>
        <div className="pro-sheet-row">
          <dt>צפי סוף החודש</dt>
          <dd>{ILS.format(data.eom)}</dd>
        </div>
        <div className="pro-sheet-row">
          <dt>יעד חודשי</dt>
          <dd>{data.eomBudget > 0 ? ILS.format(data.eomBudget) : "—"}</dd>
        </div>
        <div className="pro-sheet-row">
          <dt>מצב</dt>
          <dd>{data.safetyLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
