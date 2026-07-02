"use client";

// Variant A · Vault
//
// Wallet-tactile hero card. Layered gold reflections, dense first
// viewport, integrated micro-widgets so nothing feels sparse. Reads
// same useHomeData as the base composition.

import { motion, useReducedMotion } from "framer-motion";

import { HeroDigitSettle } from "../hero-digit-settle";
import { Eyebrow, HairlineShelf, LedgerRow, SectionHeader } from "../primitives";
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

export function VariantVault({ data }: { data: HomeData }) {
  const reduced = useReducedMotion();
  const balanceLabel = ILS.format(data.live);
  const eomTone =
    data.safetyState === "stress"
      ? "danger"
      : data.safetyState === "watch"
        ? "watch"
        : "safe";

  return (
    <div className="vault-stack">
      <motion.article
        className="vault-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <motion.span
          aria-hidden
          className="vault-hero-aurora"
          animate={
            reduced
              ? undefined
              : {
                  backgroundPosition: [
                    "88% -18%",
                    "18% 108%",
                    "88% -18%",
                  ],
                }
          }
          transition={{
            duration: reduced ? 0.1 : 30,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        <span aria-hidden className="vault-hero-gloss" />
        <span aria-hidden className="vault-hero-emboss" />

        <header className="vault-hero-head">
          <div className="vault-hero-wordmark">
            <Eyebrow accent>SALLY · CFO</Eyebrow>
            <span className="vault-hero-month">{data.monthLabel}</span>
          </div>
          <span
            className="vault-hero-status"
            data-aurora-tone={eomTone}
          >
            <span aria-hidden className="vault-hero-status-dot" />
            {data.safetyLabel}
          </span>
        </header>

        <div className="vault-hero-body">
          <div className="vault-hero-balance-block">
            <Eyebrow>יתרה חיה</Eyebrow>
            <div className="vault-hero-balance">
              <HeroDigitSettle value={balanceLabel} />
            </div>
            <HairlineShelf width={112} className="vault-hero-shelf" />
            {data.delta24h.count > 0 ? (
              <span className="vault-hero-delta" dir="ltr">
                {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · {data.delta24h.count} פעולות · 24 שעות
              </span>
            ) : null}
          </div>

          <div className="vault-hero-metrics">
            <div className="vault-hero-metric" data-aurora-tone={eomTone}>
              <Eyebrow>סוף חודש</Eyebrow>
              <span dir="ltr" className="vault-hero-metric-amount">
                {ILS.format(data.eom)}
              </span>
              <span className="vault-hero-metric-hint">
                {data.eomBudget > 0
                  ? `${PCT.format(data.budgetUsedPct / 100)} מהיעד`
                  : "בלי יעד"}
              </span>
            </div>
            <div className="vault-hero-metric">
              <Eyebrow>הבא בתור</Eyebrow>
              {data.upcoming[0] ? (
                <>
                  <span dir="ltr" className="vault-hero-metric-amount">
                    {data.upcoming[0].direction === "in" ? "+" : "−"}
                    {ILS.format(data.upcoming[0].amount)}
                  </span>
                  <span className="vault-hero-metric-hint">
                    {data.upcoming[0].label} · {data.upcoming[0].daysLabel}
                  </span>
                </>
              ) : (
                <>
                  <span dir="ltr" className="vault-hero-metric-amount">
                    —
                  </span>
                  <span className="vault-hero-metric-hint">אין אירועים קרובים</span>
                </>
              )}
            </div>
          </div>
        </div>

        <footer className="vault-hero-foot" aria-hidden>
          <span className="vault-hero-foot-eye">SAFE · WATCH · STRESS</span>
          <span
            className="vault-hero-foot-scale"
            data-aurora-tone={eomTone}
          />
        </footer>
      </motion.article>

      <section className="vault-checkpoints" aria-label="נקודות תחזית">
        {data.checkpoints.map((cp) => {
          const tone =
            cp.state === "danger"
              ? "danger"
              : cp.state === "watch"
                ? "watch"
                : "safe";
          return (
            <div key={cp.key} className="vault-checkpoint" data-aurora-live={cp.key === "live" ? "true" : "false"}>
              <Eyebrow accent={cp.key === "live"}>{cp.label}</Eyebrow>
              <span dir="ltr" className="vault-checkpoint-amount" data-aurora-tone={tone}>
                {cp.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(cp.amount))}
              </span>
              <span className="vault-checkpoint-meta">
                {cp.key === "live" ? "עכשיו" : `+${cp.daysUntil} ימים`}
              </span>
            </div>
          );
        })}
      </section>

      <section className="vault-section">
        <SectionHeader eyebrow="14 ימים · תזרים" />
        {data.upcoming.length === 0 ? (
          <p className="sally-empty-line">אין אירועים מתוכננים בשבועיים הקרובים.</p>
        ) : (
          <ul className="sally-list">
            {data.upcoming.map((r) => (
              <li key={r.id}>
                <LedgerRow
                  label={r.label}
                  meta={r.daysLabel}
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

      <section className="vault-section">
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
        <ul className="vault-cat-list">
          {data.categories.map((c) => (
            <li key={c.id} className="vault-cat-row">
              <span aria-hidden className="vault-cat-dot" style={{ background: c.color }} />
              <span className="vault-cat-label">{c.label}</span>
              <div className="vault-cat-bar" aria-hidden>
                <motion.span
                  className="vault-cat-bar-fill"
                  style={{ background: c.color }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (c.amount /
                          Math.max(1, data.categories[0]?.amount ?? 1)) *
                          100,
                      ),
                    )}%`,
                  }}
                  transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
                />
              </div>
              <span dir="ltr" className="vault-cat-amount">
                {ILS.format(c.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
