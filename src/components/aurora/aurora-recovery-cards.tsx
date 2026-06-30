"use client";

// Phase 438 · AURORA recovery cards
//
// Premium replacements for the legacy product surfaces that were
// dropped during the AURORA rebuild:
//   1. CheckpointRingCard     — circular "where am I" with LIVE / +10
//                               / EOM / 2 / 10 selector (legacy זמן)
//   2. CommitmentsBreakdownCard — sum-of-month + 4-up lanes
//                                 (Loans / Cards / Bank / Cash) +
//                                 obligation rows
//   3. CardsByMonthCard       — per-card current + next month totals,
//                                expandable to category split with
//                                fixed / one-off buckets
//
// All three are UI-only consumers of existing engine surfaces (curve,
// snapshot, statement, obligations, exposure). No formula touched.

import { useMemo, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";
import {
  type AuroraCardMonth,
  type AuroraCheckpoint,
  type AuroraCommitments,
  type AuroraRecoveryData,
} from "./use-aurora-recovery";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// ── 1. CheckpointRingCard ─────────────────────────────────────────

export function CheckpointRingCard({
  data,
}: {
  data: AuroraRecoveryData;
}) {
  const [activeKey, setActiveKey] = useState<AuroraCheckpoint["key"]>("live");
  const checkpoint = useMemo(
    () => data.checkpoints.find((c) => c.key === activeKey) ?? data.checkpoints[0],
    [data.checkpoints, activeKey],
  );
  const reduced = useReducedMotion();
  if (!checkpoint) return null;

  const stateColor =
    checkpoint.state === "danger"
      ? "var(--aurora-state-danger)"
      : checkpoint.state === "watch"
        ? "var(--aurora-state-watch)"
        : "var(--aurora-state-safe)";
  const stateLabel =
    checkpoint.state === "danger"
      ? "סיכון"
      : checkpoint.state === "watch"
        ? "צפוף"
        : "בטוח";

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 3, text: "מצב פיננסי בנקודה" }}>
          איפה אני · {checkpoint.label}
        </Eyebrow>
        <span
          aria-hidden
          className="aurora-checkpoint-pill"
          style={{ borderColor: `${stateColor}55`, color: stateColor }}
        >
          <span className="aurora-checkpoint-dot" style={{ background: stateColor }} />
          {stateLabel}
        </span>
      </div>

      <div className="aurora-checkpoint-ring">
        <svg viewBox="0 0 220 220" aria-hidden width="100%" height="100%">
          <defs>
            <radialGradient id="aurora-ring-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={stateColor} stopOpacity="0.36" />
              <stop offset="100%" stopColor={stateColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="110" cy="110" r="100" fill="url(#aurora-ring-glow)" />
          <circle
            cx="110"
            cy="110"
            r="92"
            fill="none"
            stroke="var(--aurora-hairline-quiet)"
            strokeWidth="1.5"
          />
          <circle
            cx="110"
            cy="110"
            r="92"
            fill="none"
            stroke={stateColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="20 12"
            opacity="0.6"
          />
          {/* Index dots — each checkpoint pinned around the ring. */}
          {data.checkpoints.map((cp, i) => {
            const total = data.checkpoints.length;
            const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
            const x = 110 + Math.cos(angle) * 92;
            const y = 110 + Math.sin(angle) * 92;
            const isActive = cp.key === activeKey;
            return (
              <circle
                key={cp.key}
                cx={x}
                cy={y}
                r={isActive ? 6 : 3}
                fill={
                  cp.state === "danger"
                    ? "var(--aurora-state-danger)"
                    : cp.state === "watch"
                      ? "var(--aurora-state-watch)"
                      : "var(--aurora-state-safe)"
                }
                opacity={isActive ? 1 : 0.4}
              />
            );
          })}
        </svg>
        <div className="aurora-checkpoint-center">
          <Eyebrow>{checkpoint.label}</Eyebrow>
          <motion.span
            key={checkpoint.key}
            dir="ltr"
            className="aurora-checkpoint-amount"
            style={{
              color:
                checkpoint.balance < 0
                  ? "var(--aurora-state-danger)"
                  : "var(--aurora-ink-1)",
            }}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.36, ease: [0.32, 0.72, 0, 1] }}
          >
            <DigitOdometer
              value={`${checkpoint.balance < 0 ? "−" : ""}${ILS.format(Math.abs(checkpoint.balance))}`}
            />
          </motion.span>
          <span className="aurora-checkpoint-when">
            {DATE_FMT.format(new Date(checkpoint.whenISO))}
          </span>
        </div>
      </div>

      <div className="aurora-checkpoint-chips" role="tablist" aria-label="בחירת נקודת זמן">
        {data.checkpoints.map((cp) => {
          const active = cp.key === activeKey;
          return (
            <motion.button
              key={cp.key}
              type="button"
              role="tab"
              aria-selected={active}
              className="aurora-checkpoint-chip"
              data-aurora-active={active ? "true" : "false"}
              onClick={() => setActiveKey(cp.key)}
              whileTap={reduced ? undefined : { scale: 0.96 }}
            >
              {cp.label}
            </motion.button>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ── 2. CommitmentsBreakdownCard ──────────────────────────────────

const LANE_META: Array<{
  key: keyof AuroraCommitments;
  label: string;
  accent: string;
}> = [
  { key: "loans", label: "הלוואות", accent: "var(--aurora-lane-loan)" },
  { key: "cards", label: "אשראי", accent: "var(--aurora-lane-card)" },
  { key: "bank", label: "בנק", accent: "var(--aurora-lane-bank)" },
  { key: "cash", label: "מזומן", accent: "var(--aurora-lane-cash)" },
];

export function CommitmentsBreakdownCard({
  data,
}: {
  data: AuroraRecoveryData;
}) {
  const c = data.commitments;
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 3, text: "סך התחייבויות החודש" }}>
          סך התחייבויות · {data.monthLabel}
        </Eyebrow>
        <span className="aurora-commit-income" dir="ltr">
          הכנסה צפויה {ILS.format(c.income.amount)}
        </span>
      </div>
      <div className="aurora-card-row-amount">
        <span dir="ltr" className="aurora-card-amount-lg">
          <DigitOdometer value={ILS.format(c.total)} />
        </span>
        <span className="aurora-body aurora-ink-3">חיובים מתוכננים</span>
      </div>

      <div className="aurora-commit-lanes">
        {LANE_META.map((m) => {
          const lane = c[m.key] as { amount: number; count: number };
          return (
            <div
              key={m.key}
              className="aurora-commit-lane"
              style={{ borderColor: `${m.accent}55` }}
            >
              <span className="aurora-commit-lane-eyebrow">{m.label}</span>
              <span
                dir="ltr"
                className="aurora-commit-lane-amount"
                style={{ color: m.accent }}
              >
                {ILS.format(lane.amount)}
              </span>
              <span className="aurora-commit-lane-meta">
                {lane.count > 0 ? `${lane.count} פריטים` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="aurora-commit-list">
        <li>
          <span className="aurora-commit-list-label">קבועים</span>
          <span dir="ltr" className="aurora-commit-list-amount">
            {ILS.format(c.fixed.amount)}
          </span>
          <span className="aurora-commit-list-meta">
            {c.fixed.count} חיובים
          </span>
        </li>
        <li>
          <span className="aurora-commit-list-label">תשלומים פתוחים</span>
          <span dir="ltr" className="aurora-commit-list-amount">
            {ILS.format(c.cards.amount)}
          </span>
          <span className="aurora-commit-list-meta">
            פרוסים על כרטיסים
          </span>
        </li>
      </ul>
    </GlassCard>
  );
}

// ── 3. CardsByMonthCard ──────────────────────────────────────────

export function CardsByMonthCard({
  data,
}: {
  data: AuroraRecoveryData;
}) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  if (data.cardsByMonth.length === 0) {
    return (
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "כרטיסי אשראי לפי חודש" }}>
          כרטיסי אשראי · לפי חודש
        </Eyebrow>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          אין כרטיסים פעילים. הוסף כרטיס בהגדרות כדי לראות את חיובי החודש הנוכחי והבא.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 3, text: "כרטיסי אשראי לפי חודש" }}>
          כרטיסי אשראי · לפי חודש
        </Eyebrow>
        <span dir="ltr" className="aurora-cards-total">
          {ILS.format(data.cardsTotalCurrent + data.cardsTotalNext)}
        </span>
      </div>
      <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
        כל כרטיס מציג את חיובי החודש הנוכחי + חודשי החיוב הבאים. תקיש על תיקייה לפתיחה.
      </p>

      <ul className="aurora-cards-list">
        {data.cardsByMonth.map((card) => (
          <CardRow
            key={card.cardId}
            card={card}
            open={openCardId === card.cardId}
            onToggle={() =>
              setOpenCardId((p) => (p === card.cardId ? null : card.cardId))
            }
          />
        ))}
      </ul>
    </GlassCard>
  );
}

function CardRow({
  card,
  open,
  onToggle,
}: {
  card: AuroraCardMonth;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const fixedTotal = card.byCategory.reduce((s, c) => s + c.fixedAmount, 0);
  const oneOffTotal = card.byCategory.reduce((s, c) => s + c.oneOffAmount, 0);
  return (
    <li className="aurora-card-row-li">
      <button
        type="button"
        className="aurora-card-row-button"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span aria-hidden className="aurora-card-row-icon">
          <CardGlyph />
        </span>
        <div className="aurora-card-row-body">
          <span className="aurora-card-row-title">{card.cardLabel}</span>
          <span className="aurora-card-row-hint" dir="ltr">
            החודש {ILS.format(card.currentTotal)} · הבא {ILS.format(card.nextTotal)}
            {card.cardLast4 ? ` · ****${card.cardLast4}` : ""}
          </span>
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
            className="aurora-card-row-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="aurora-card-bucket-row">
              <Bucket
                label="קבועים"
                amount={fixedTotal}
                accent="var(--aurora-brand-aurora-1)"
              />
              <Bucket
                label="חד-פעמיים"
                amount={oneOffTotal}
                accent="var(--aurora-brand-aurora-2)"
              />
              <Bucket
                label="הבא"
                amount={card.nextTotal}
                accent="var(--aurora-accent-gold-loud)"
              />
            </div>
            {card.byCategory.length === 0 ? (
              <p className="aurora-body aurora-ink-3">
                אין חיובים החודש על כרטיס זה.
              </p>
            ) : (
              <ul className="aurora-card-category-list">
                {card.byCategory.map((cat) => (
                  <li key={String(cat.category)}>
                    <span
                      aria-hidden
                      className="aurora-cat-dot"
                      style={{ background: cat.accent }}
                    />
                    <span className="aurora-cat-label">{cat.label}</span>
                    <span dir="ltr" className="aurora-cat-amount">
                      {ILS.format(cat.amount)}
                    </span>
                    <span className="aurora-cat-delta" data-aurora-tone="safe">
                      {cat.fixedAmount > 0 ? `קבוע ${ILS.format(cat.fixedAmount)}` : "חד-פעמי"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
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
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none">
      <rect
        x="2"
        y="4.5"
        width="16"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1="2"
        y1="8"
        x2="18"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
