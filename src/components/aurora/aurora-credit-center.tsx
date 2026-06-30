"use client";

// Phase 442 · AURORA recovery — Credit Center workspace
//
// Replaces CardsByMonthCard with a full Credit Center. UI-only;
// every number is composed by useAuroraRecovery → getCreditCard
// Statement / getCreditExposure / Account fields. No engine math
// touched.

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";

import type {
  AuroraCardMonth,
  AuroraRecoveryData,
} from "./use-aurora-recovery";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});

type Health = "safe" | "watch" | "danger";

function utilisationHealth(util?: number): Health {
  if (util === undefined) return "safe";
  if (util >= 0.85) return "danger";
  if (util >= 0.6) return "watch";
  return "safe";
}

function healthLabel(h: Health): string {
  if (h === "danger") return "ניצול גבוה";
  if (h === "watch") return "ניצול בינוני";
  return "ניצול נמוך";
}

function healthColor(h: Health): string {
  if (h === "danger") return "var(--aurora-state-danger)";
  if (h === "watch") return "var(--aurora-state-watch)";
  return "var(--aurora-state-safe)";
}

export function AuroraCreditCenter({ data }: { data: AuroraRecoveryData }) {
  const cards = data.cardsByMonth;
  const [openId, setOpenId] = useState<string | null>(null);

  const summary = useMemo(() => {
    let totalCurrent = 0;
    let totalNext = 0;
    let totalLimit = 0;
    let totalDebt = 0;
    for (const c of cards) {
      totalCurrent += c.currentTotal;
      totalNext += c.nextTotal;
      if (typeof c.creditLimit === "number") totalLimit += c.creditLimit;
      if (typeof c.currentDebt === "number") totalDebt += c.currentDebt;
    }
    return {
      totalCurrent: Math.round(totalCurrent),
      totalNext: Math.round(totalNext),
      totalLimit: Math.round(totalLimit),
      totalDebt: Math.round(totalDebt),
    };
  }, [cards]);

  if (cards.length === 0) {
    return (
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "מרכז אשראי" }}>
          מרכז אשראי
        </Eyebrow>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          אין כרטיסים פעילים. הוסף כרטיס בהגדרות כדי להפעיל את מרכז האשראי.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 3, text: "מרכז אשראי" }}>
          מרכז אשראי · {data.monthLabel}
        </Eyebrow>
        <span dir="ltr" className="aurora-credit-sum">
          {ILS.format(summary.totalCurrent + summary.totalNext)}
        </span>
      </div>
      <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
        כל כרטיס בנפרד: חיוב נוכחי + חודש הבא + תשלומים + מסחר. תקיש לפתיחת תיק מלא.
      </p>

      <div className="aurora-credit-summary-grid">
        <SummaryStat label="חיוב החודש" amount={summary.totalCurrent} accent="var(--aurora-ink-1)" />
        <SummaryStat label="חודש הבא" amount={summary.totalNext} accent="var(--aurora-accent-gold-loud)" />
        <SummaryStat
          label="ניצול כולל"
          custom={
            summary.totalLimit > 0
              ? PCT.format(Math.min(1, summary.totalDebt / summary.totalLimit))
              : "—"
          }
          accent="var(--aurora-brand-aurora-2)"
        />
      </div>

      <ul className="aurora-credit-list">
        {cards.map((card) => (
          <CardWorkspace
            key={card.cardId}
            card={card}
            open={openId === card.cardId}
            onToggle={() =>
              setOpenId((p) => (p === card.cardId ? null : card.cardId))
            }
          />
        ))}
      </ul>
    </GlassCard>
  );
}

function SummaryStat({
  label,
  amount,
  accent,
  custom,
}: {
  label: string;
  amount?: number;
  accent: string;
  custom?: string;
}) {
  return (
    <div className="aurora-credit-summary-cell">
      <Eyebrow>{label}</Eyebrow>
      <span dir="ltr" className="aurora-credit-summary-amount" style={{ color: accent }}>
        {custom ?? ILS.format(amount ?? 0)}
      </span>
    </div>
  );
}

function CardWorkspace({
  card,
  open,
  onToggle,
}: {
  card: AuroraCardMonth;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const health = utilisationHealth(card.utilisation);
  const tint = card.cardColor ?? "#7BA9FF";
  const total = card.currentTotal + card.nextTotal;
  const billingDay = card.billingDay;
  const paymentDay = card.paymentDay;

  return (
    <li className="aurora-credit-card-li">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="aurora-credit-card-button"
        style={{
          background: `linear-gradient(135deg, ${tint}24, var(--aurora-glass-elev-1) 80%)`,
          borderColor: `${tint}55`,
        }}
      >
        <span
          aria-hidden
          className="aurora-credit-card-chip"
          style={{ background: tint }}
        >
          <CardGlyph />
        </span>
        <div className="aurora-credit-card-body">
          <span className="aurora-credit-card-title">{card.cardLabel}</span>
          <span className="aurora-credit-card-meta" dir="ltr">
            {card.cardLast4 ? `****${card.cardLast4}` : "—"}
            {card.cardIssuer ? ` · ${card.cardIssuer.toUpperCase()}` : ""}
          </span>
          <div className="aurora-credit-card-headline">
            <span className="aurora-credit-card-amount" dir="ltr">
              <DigitOdometer value={ILS.format(card.currentTotal)} />
            </span>
            <span className="aurora-credit-card-next" dir="ltr">
              הבא {ILS.format(card.nextTotal)}
            </span>
          </div>
          <div className="aurora-credit-card-pills">
            <span
              className="aurora-credit-pill"
              style={{ color: healthColor(health), borderColor: `${healthColor(health)}55` }}
            >
              {healthLabel(health)}
            </span>
            {card.installmentsRemaining > 0 ? (
              <span className="aurora-credit-pill">
                {card.installmentsRemaining} תשלומים פעילים
              </span>
            ) : null}
            {billingDay ? (
              <span className="aurora-credit-pill">חיוב יום {billingDay}</span>
            ) : null}
            {paymentDay ? (
              <span className="aurora-credit-pill">פירעון יום {paymentDay}</span>
            ) : null}
          </div>
        </div>
        <motion.span
          aria-hidden
          className="aurora-card-row-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="aurora-credit-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.32, ease: [0.32, 0.72, 0, 1] }}
          >
            <UtilisationBar card={card} health={health} />

            <div className="aurora-card-bucket-row">
              <Bucket label="קבועים" amount={card.fixedTotal} accent="var(--aurora-brand-aurora-1)" />
              <Bucket
                label="חד-פעמיים"
                amount={card.oneOffTotal}
                accent="var(--aurora-brand-aurora-2)"
              />
              <Bucket
                label="תשלומים"
                amount={card.installmentsAmount}
                accent="var(--aurora-accent-gold-loud)"
              />
            </div>

            <section className="aurora-credit-section">
              <Eyebrow>חודש הבא — תצוגה מקדימה</Eyebrow>
              {card.byCategoryNext.length === 0 ? (
                <p className="aurora-body aurora-ink-3">
                  אין חיובים מתוכננים לחודש הבא על כרטיס זה.
                </p>
              ) : (
                <ul className="aurora-credit-mini-list">
                  {card.byCategoryNext.slice(0, 5).map((c) => (
                    <li key={String(c.category)}>
                      <span
                        aria-hidden
                        className="aurora-cat-dot"
                        style={{ background: c.accent }}
                      />
                      <span className="aurora-cat-label">{c.label}</span>
                      <span dir="ltr" className="aurora-cat-amount">
                        {ILS.format(c.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="aurora-credit-section">
              <Eyebrow>פילוח קטגוריות החודש</Eyebrow>
              {card.byCategory.length === 0 ? (
                <p className="aurora-body aurora-ink-3">אין חיובים החודש על כרטיס זה.</p>
              ) : (
                <ul className="aurora-card-category-list">
                  {card.byCategory.map((c) => (
                    <li key={String(c.category)}>
                      <span aria-hidden className="aurora-cat-dot" style={{ background: c.accent }} />
                      <span className="aurora-cat-label">{c.label}</span>
                      <span dir="ltr" className="aurora-cat-amount">
                        {ILS.format(c.amount)}
                      </span>
                      <span className="aurora-cat-delta" data-aurora-tone="safe">
                        {c.fixedAmount > 0 ? `קבוע ${ILS.format(c.fixedAmount)}` : "חד-פעמי"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="aurora-credit-section">
              <Eyebrow>בתי עסק מובילים</Eyebrow>
              {card.topMerchants.length === 0 ? (
                <p className="aurora-body aurora-ink-3">
                  אין חיובים על כרטיס זה כדי לחשב מסחר מוביל.
                </p>
              ) : (
                <ul className="aurora-credit-merchants">
                  {card.topMerchants.map((m, idx) => (
                    <li key={`${m.label}-${idx}`}>
                      <span className="aurora-credit-merchant-rank">#{idx + 1}</span>
                      <span className="aurora-credit-merchant-label">{m.label}</span>
                      <span dir="ltr" className="aurora-credit-merchant-amount">
                        {ILS.format(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="aurora-body aurora-ink-3">
              סה״כ חיובים פעילים על כרטיס זה החודש + הבא: {ILS.format(total)} (
              {card.transactionCount} עסקאות).
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function UtilisationBar({
  card,
  health,
}: {
  card: AuroraCardMonth;
  health: Health;
}) {
  const reduced = useReducedMotion();
  const tone = healthColor(health);
  const limit = card.creditLimit;
  const debt = card.currentDebt;
  const util = card.utilisation;
  const remaining = card.remainingCredit;
  if (typeof limit !== "number" || limit <= 0) {
    return (
      <div className="aurora-credit-util aurora-credit-util-missing">
        <Eyebrow>ניצול אשראי</Eyebrow>
        <p className="aurora-body aurora-ink-3">
          הגדר מסגרת אשראי בהגדרות הכרטיס כדי לראות שיעור ניצול ונותר זמין.
        </p>
      </div>
    );
  }
  const pct = util ?? 0;
  return (
    <div className="aurora-credit-util">
      <div className="aurora-credit-util-head">
        <Eyebrow>ניצול אשראי</Eyebrow>
        <span dir="ltr" className="aurora-credit-util-pct" style={{ color: tone }}>
          {PCT.format(pct)}
        </span>
      </div>
      <div className="aurora-credit-util-bar" aria-hidden>
        <motion.span
          className="aurora-credit-util-fill"
          initial={reduced ? { width: `${pct * 100}%` } : { width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: reduced ? 0.12 : 0.7, ease: [0.32, 0.72, 0, 1] }}
          style={{ background: tone, boxShadow: `0 0 16px ${tone}66` }}
        />
      </div>
      <div className="aurora-credit-util-foot">
        <span className="aurora-body aurora-ink-3" dir="ltr">
          חוב {ILS.format(debt ?? card.currentTotal)} מתוך {ILS.format(limit)}
        </span>
        {remaining !== undefined ? (
          <span className="aurora-body aurora-ink-2" dir="ltr">
            נותר זמין {ILS.format(remaining)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Bucket({
  label,
  amount,
  accent,
}: {
  label: string;
  amount: number;
  accent: string;
}) {
  return (
    <div className="aurora-card-bucket" style={{ borderColor: `${accent}55` }}>
      <span className="aurora-card-bucket-label">{label}</span>
      <span dir="ltr" className="aurora-card-bucket-amount" style={{ color: accent }}>
        {ILS.format(amount)}
      </span>
    </div>
  );
}

function CardGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
