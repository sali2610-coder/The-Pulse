"use client";

// Variant B · Concierge
//
// Editorial concierge feel. Big signature hero with prominent EOM +
// safety strip; horizontal 14-day event reel; category chip carousel.
// Same useHomeData — no engine change.

import { motion, useReducedMotion } from "framer-motion";

import { HeroDigitSettle } from "../hero-digit-settle";
import {
  Eyebrow,
  GoldSentence,
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

export function VariantConcierge({ data }: { data: HomeData }) {
  const reduced = useReducedMotion();
  const balanceLabel = ILS.format(data.live);
  const eomTone =
    data.safetyState === "stress"
      ? "danger"
      : data.safetyState === "watch"
        ? "watch"
        : "safe";
  const spendShare = Math.max(
    0.05,
    Math.min(1, data.eomBudget > 0 ? data.budgetUsedPct / 100 : 0.5),
  );

  return (
    <div className="conc-stack">
      <motion.article
        className="conc-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <motion.span
          aria-hidden
          className="conc-hero-aurora"
          animate={
            reduced
              ? undefined
              : {
                  backgroundPosition: [
                    "80% -8%",
                    "20% 108%",
                    "80% -8%",
                  ],
                }
          }
          transition={{
            duration: reduced ? 0.1 : 34,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        <span aria-hidden className="conc-hero-gloss" />

        <div className="conc-hero-head">
          <div>
            <Eyebrow accent>SALLY · CONCIERGE</Eyebrow>
            <span className="conc-hero-month">{data.monthLabel}</span>
          </div>
          <span className="conc-hero-status" data-aurora-tone={eomTone}>
            <span aria-hidden className="conc-hero-status-dot" />
            {data.safetyLabel}
          </span>
        </div>

        <div className="conc-hero-balance-row">
          <div className="conc-hero-balance">
            <Eyebrow>יתרה חיה</Eyebrow>
            <div className="conc-hero-balance-amount">
              <HeroDigitSettle value={balanceLabel} />
            </div>
            <HairlineShelf width={124} />
            {data.delta24h.count > 0 ? (
              <span className="conc-hero-delta" dir="ltr">
                {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · 24 שעות
              </span>
            ) : null}
          </div>
          <div className="conc-hero-eom">
            <Eyebrow>סוף חודש</Eyebrow>
            <span
              dir="ltr"
              className="conc-hero-eom-amount"
              data-aurora-tone={eomTone}
            >
              {ILS.format(data.eom)}
            </span>
            {data.eomBudget > 0 ? (
              <span className="conc-hero-eom-meta">
                {data.budgetUsedPct}% מהיעד · {ILS.format(data.eomBudget)}
              </span>
            ) : (
              <span className="conc-hero-eom-meta">בלי יעד</span>
            )}
          </div>
        </div>

        <div className="conc-safety-strip" aria-hidden>
          <span className="conc-safety-gradient" />
          <motion.span
            className="conc-safety-marker"
            initial={{ insetInlineStart: 0 }}
            animate={{ insetInlineStart: `${spendShare * 100}%` }}
            transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
          />
        </div>

        {data.heroSentence ? <GoldSentence>{data.heroSentence}</GoldSentence> : null}
      </motion.article>

      <section className="conc-checkpoint-strip" aria-label="נקודות זמן">
        {data.checkpoints.map((cp) => {
          const tone =
            cp.state === "danger"
              ? "danger"
              : cp.state === "watch"
                ? "watch"
                : "safe";
          const active = cp.key === "live";
          return (
            <div key={cp.key} className="conc-checkpoint" data-aurora-live={active ? "true" : "false"}>
              <Eyebrow accent={active}>{cp.label}</Eyebrow>
              <span dir="ltr" className="conc-checkpoint-amount" data-aurora-tone={tone}>
                {cp.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(cp.amount))}
              </span>
            </div>
          );
        })}
      </section>

      <section>
        <SectionHeader eyebrow="14 ימים · תזרים" />
        {data.upcoming.length === 0 ? (
          <p className="sally-empty-line">אין אירועים מתוכננים בשבועיים הקרובים.</p>
        ) : (
          <div className="conc-reel" role="list">
            {data.upcoming.map((r) => (
              <article key={r.id} className="conc-reel-card" role="listitem">
                <Eyebrow accent>{r.daysLabel}</Eyebrow>
                <h3 className="conc-reel-title">{r.label}</h3>
                <span
                  dir="ltr"
                  className="conc-reel-amount"
                  data-aurora-tone={r.direction === "in" ? "safe" : "ink"}
                >
                  {r.direction === "in" ? "+" : "−"}
                  {ILS.format(r.amount)}
                </span>
                <span className="conc-reel-kind">
                  {r.kind === "income"
                    ? "הכנסה"
                    : r.kind === "loan"
                      ? "הלוואה"
                      : r.kind === "card"
                        ? "חיוב כרטיס"
                        : "חיוב בנק"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          eyebrow="לאן הולך הכסף"
          end={
            data.categories.length ? (
              <span dir="ltr" className="sally-section-end-amount">
                {ILS.format(data.categories.reduce((s, c) => s + c.amount, 0))}
              </span>
            ) : null
          }
        />
        <div className="conc-cat-reel" role="list">
          {data.categories.map((c) => (
            <div key={c.id} className="conc-cat-chip" role="listitem">
              <span aria-hidden className="conc-cat-dot" style={{ background: c.color }} />
              <span className="conc-cat-label">{c.label}</span>
              <span dir="ltr" className="conc-cat-amount">
                {ILS.format(c.amount)}
              </span>
              {c.deltaPct !== null ? (
                <span
                  dir="ltr"
                  className="conc-cat-delta"
                  data-aurora-tone={
                    c.deltaPct >= 25
                      ? "watch"
                      : c.deltaPct <= -15
                        ? "safe"
                        : "neutral"
                  }
                >
                  {c.deltaPct >= 0 ? "↑" : "↓"} {Math.abs(Math.round(c.deltaPct))}%
                </span>
              ) : null}
            </div>
          ))}
        </div>
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
