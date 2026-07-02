"use client";

// Variant C · Portfolio
//
// Portfolio-manager feel. Two-column hero (balance left, EOM donut
// right). Positions grid (Loans / Cards / Bank / Cash / Income) as
// financial holdings. Same useHomeData.

import { motion, useReducedMotion } from "framer-motion";

import { HeroDigitSettle } from "../hero-digit-settle";
import {
  Eyebrow,
  HairlineShelf,
  LedgerRow,
  SectionHeader,
} from "../primitives";
import type { HomeData } from "../use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function VariantPortfolio({ data }: { data: HomeData }) {
  const reduced = useReducedMotion();
  const balanceLabel = ILS.format(data.live);
  const eomTone =
    data.safetyState === "stress"
      ? "danger"
      : data.safetyState === "watch"
        ? "watch"
        : "safe";
  const donutRatio =
    data.eomBudget > 0 ? Math.min(1, data.budgetUsedPct / 100) : 0.5;

  return (
    <div className="port-stack">
      <motion.article
        className="port-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <motion.span
          aria-hidden
          className="port-hero-aurora"
          animate={
            reduced
              ? undefined
              : {
                  backgroundPosition: [
                    "90% -12%",
                    "10% 112%",
                    "90% -12%",
                  ],
                }
          }
          transition={{
            duration: reduced ? 0.1 : 32,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        <span aria-hidden className="port-hero-gloss" />

        <div className="port-hero-head">
          <div>
            <Eyebrow accent>SALLY · PORTFOLIO</Eyebrow>
            <span className="port-hero-month">{data.monthLabel}</span>
          </div>
          <span className="port-hero-status" data-aurora-tone={eomTone}>
            <span aria-hidden className="port-hero-status-dot" />
            {data.safetyLabel}
          </span>
        </div>

        <div className="port-hero-columns">
          <div className="port-hero-left">
            <Eyebrow>יתרה חיה</Eyebrow>
            <div className="port-hero-balance">
              <HeroDigitSettle value={balanceLabel} />
            </div>
            <HairlineShelf width={112} className="port-hero-shelf" />
            {data.delta24h.count > 0 ? (
              <span className="port-hero-delta" dir="ltr">
                {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · 24 שעות
              </span>
            ) : null}
            <div className="port-hero-next">
              <Eyebrow>הבא בתור</Eyebrow>
              {data.upcoming[0] ? (
                <>
                  <span className="port-hero-next-title">
                    {data.upcoming[0].label}
                  </span>
                  <span className="port-hero-next-meta">
                    {data.upcoming[0].direction === "in" ? "+" : "−"}
                    {ILS.format(data.upcoming[0].amount)} · {data.upcoming[0].daysLabel}
                  </span>
                </>
              ) : (
                <span className="port-hero-next-meta">
                  אין אירועים קרובים
                </span>
              )}
            </div>
          </div>

          <div className="port-hero-right">
            <Donut ratio={donutRatio} tone={eomTone} />
            <Eyebrow>סוף חודש</Eyebrow>
            <span
              dir="ltr"
              className="port-hero-eom"
              data-aurora-tone={eomTone}
            >
              {ILS.format(data.eom)}
            </span>
            <span className="port-hero-eom-hint">
              {data.eomBudget > 0
                ? `${PCT.format(data.budgetUsedPct / 100)} נוצל · יעד ${ILS.format(data.eomBudget)}`
                : "בלי יעד"}
            </span>
          </div>
        </div>
      </motion.article>

      <section aria-label="נקודות תזמון" className="port-checkpoints">
        {data.checkpoints.map((cp) => {
          const tone =
            cp.state === "danger"
              ? "danger"
              : cp.state === "watch"
                ? "watch"
                : "safe";
          const active = cp.key === "live";
          return (
            <div
              key={cp.key}
              className="port-checkpoint"
              data-aurora-live={active ? "true" : "false"}
            >
              <Eyebrow accent={active}>{cp.label}</Eyebrow>
              <span
                dir="ltr"
                className="port-checkpoint-amount"
                data-aurora-tone={tone}
              >
                {cp.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(cp.amount))}
              </span>
              <span className="port-checkpoint-meta">
                {active ? "עכשיו" : `+${cp.daysUntil} ימים`}
              </span>
            </div>
          );
        })}
      </section>

      <section>
        <SectionHeader
          eyebrow="פוזיציות חודשיות"
          end={
            <span dir="ltr" className="sally-section-end-amount">
              {ILS.format(data.obligations.total)}
            </span>
          }
        />
        <ul className="port-positions">
          {data.obligations.lanes.map((lane) => (
            <li key={lane.key} className="port-position">
              <span aria-hidden className="port-position-dot" style={{ background: lane.color }} />
              <div className="port-position-text">
                <span className="port-position-label">{lane.label}</span>
                <span className="port-position-hint">
                  {PCT.format(lane.share)} מהחודש
                </span>
              </div>
              <span dir="ltr" className="port-position-amount">
                {ILS.format(lane.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeader eyebrow="פעולות אחרונות" />
        {data.recent.length === 0 ? (
          <p className="sally-empty-line">אין פעולות שנרשמו החודש.</p>
        ) : (
          <ul className="sally-list">
            {data.recent.map((r) => (
              <li key={r.id}>
                <LedgerRow
                  label={r.label}
                  meta={r.metaLabel}
                  amount={
                    <>
                      {r.direction === "in" ? "+" : "−"}
                      {ILS.format(r.amount)}
                    </>
                  }
                  amountTone={r.direction === "in" ? "safe" : "ink"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Donut({
  ratio,
  tone,
}: {
  ratio: number;
  tone: "safe" | "watch" | "danger";
}) {
  const reduced = useReducedMotion();
  const size = 132;
  const stroke = 12;
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <linearGradient id="port-donut-track" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#port-donut-track)"
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
        transition={{ duration: reduced ? 0.1 : 0.9, ease: [0.32, 0.72, 0, 1] }}
      />
    </svg>
  );
}
