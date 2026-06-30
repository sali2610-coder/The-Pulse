"use client";

// Phase 441 · AURORA recovery — Checkpoints Workspace
//
// Signature experience: large animated checkpoint ring + swipeable
// chip selector + rich engine-driven breakdown. Reads every number
// through useAuroraCheckpoints — UI-only.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  PanInfo,
  useReducedMotion,
} from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";

import {
  useAuroraCheckpoints,
  type AuroraCheckpointBreakdown,
  type CheckpointKey,
} from "./use-aurora-checkpoints";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const FULL_DATE = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function signedAmount(amount: number): string {
  if (amount === 0) return ILS.format(0);
  const abs = ILS.format(Math.abs(amount));
  return amount < 0 ? `−${abs}` : abs;
}

function toneColor(state: AuroraCheckpointBreakdown["state"]): string {
  if (state === "danger") return "var(--aurora-state-danger)";
  if (state === "watch") return "var(--aurora-state-watch)";
  return "var(--aurora-state-safe)";
}

function toneLabel(state: AuroraCheckpointBreakdown["state"]): string {
  if (state === "danger") return "סיכון";
  if (state === "watch") return "צפוף";
  return "בטוח";
}

export function AuroraCheckpointsWorkspace() {
  const data = useAuroraCheckpoints();
  const [activeKey, setActiveKey] = useState<CheckpointKey>("live");
  const reduced = useReducedMotion();

  const active = useMemo(
    () => data.checkpoints.find((c) => c.key === activeKey) ?? data.checkpoints[0],
    [data.checkpoints, activeKey],
  );

  // Touch / swipe between checkpoints (mobile-first).
  const handleSwipe = (_e: unknown, info: PanInfo) => {
    if (!data.checkpoints.length) return;
    const idx = data.checkpoints.findIndex((c) => c.key === activeKey);
    if (idx === -1) return;
    if (info.offset.x > 60 && idx > 0) {
      setActiveKey(data.checkpoints[idx - 1].key);
    } else if (info.offset.x < -60 && idx < data.checkpoints.length - 1) {
      setActiveKey(data.checkpoints[idx + 1].key);
    }
  };

  if (!data.ready || data.isDemo || !active) {
    return null;
  }

  const tone = toneColor(active.state);
  return (
    <section className="aurora-checkpoints-workspace" aria-label="מרכז נקודות זמן פיננסיות">
      <header className="aurora-checkpoints-header">
        <Eyebrow srHeading={{ level: 2, text: "מרכז נקודות זמן" }}>
          מרכז נקודות זמן · {data.monthLabel}
        </Eyebrow>
        <span className="aurora-body aurora-ink-3">
          איפה הכסף יהיה בכל נקודה — לפי מנוע התחזית של Pulse.
        </span>
      </header>

      <motion.div
        className="aurora-checkpoints-stage"
        drag={reduced ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleSwipe}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active.key}
            className="aurora-checkpoint-ring-large"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduced ? 0.12 : 0.42, ease: [0.32, 0.72, 0, 1] }}
          >
            <BigRing
              points={data.checkpoints}
              active={active}
              tone={tone}
            />
            <div className="aurora-checkpoint-center-large">
              <span className="aurora-checkpoint-eyebrow">{active.label}</span>
              <motion.span
                dir="ltr"
                className="aurora-checkpoint-balance"
                key={`${active.key}-amount`}
                style={{
                  color:
                    active.expectedBalance < 0
                      ? "var(--aurora-state-danger)"
                      : "var(--aurora-ink-1)",
                }}
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0.12 : 0.42, ease: [0.32, 0.72, 0, 1] }}
              >
                <DigitOdometer value={signedAmount(active.expectedBalance)} />
              </motion.span>
              <span className="aurora-checkpoint-when">
                {FULL_DATE.format(new Date(active.whenISO))}
              </span>
              <span
                className="aurora-checkpoint-state"
                style={{ color: tone, borderColor: `${tone}55` }}
              >
                <span className="aurora-checkpoint-dot" style={{ background: tone }} />
                {toneLabel(active.state)}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <ChipSwitcher
        items={data.checkpoints}
        active={activeKey}
        onPick={setActiveKey}
      />

      <BreakdownGrid checkpoint={active} live={data.liveBalance} />

      <EventLane checkpoint={active} />
    </section>
  );
}

function BigRing({
  points,
  active,
  tone,
}: {
  points: AuroraCheckpointBreakdown[];
  active: AuroraCheckpointBreakdown;
  tone: string;
}) {
  const reduced = useReducedMotion();
  const r = 130;
  const c = 2 * Math.PI * r;
  // Progress = sign-aware "where on the calendar we are" approximation.
  const idx = points.findIndex((p) => p.key === active.key);
  const progress = (idx + 1) / Math.max(1, points.length);
  const offset = c - progress * c;
  return (
    <svg viewBox="0 0 320 320" aria-hidden width="100%" height="100%">
      <defs>
        <radialGradient id="aurora-cp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tone} stopOpacity="0.38" />
          <stop offset="55%" stopColor={tone} stopOpacity="0.08" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aurora-cp-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--aurora-brand-aurora-1)" />
          <stop offset="100%" stopColor={tone} />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="url(#aurora-cp-glow)" />
      <circle
        cx="160"
        cy="160"
        r={r}
        fill="none"
        stroke="var(--aurora-hairline-quiet)"
        strokeWidth="2"
      />
      <motion.circle
        cx="160"
        cy="160"
        r={r}
        fill="none"
        stroke="url(#aurora-cp-arc)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        transform="rotate(-90 160 160)"
        initial={reduced ? { strokeDashoffset: offset } : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: reduced ? 0.12 : 0.9, ease: [0.32, 0.72, 0, 1] }}
      />
      {points.map((p, i) => {
        const angle = ((i + 0.5) / points.length) * Math.PI * 2 - Math.PI / 2;
        const x = 160 + Math.cos(angle) * r;
        const y = 160 + Math.sin(angle) * r;
        const isActive = p.key === active.key;
        const pTone =
          p.state === "danger"
            ? "var(--aurora-state-danger)"
            : p.state === "watch"
              ? "var(--aurora-state-watch)"
              : "var(--aurora-state-safe)";
        return (
          <g key={p.key}>
            <circle
              cx={x}
              cy={y}
              r={isActive ? 9 : 4}
              fill={pTone}
              opacity={isActive ? 1 : 0.45}
            />
            {isActive ? (
              <circle
                cx={x}
                cy={y}
                r={14}
                fill="none"
                stroke={pTone}
                strokeWidth="1.5"
                opacity={0.5}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function ChipSwitcher({
  items,
  active,
  onPick,
}: {
  items: AuroraCheckpointBreakdown[];
  active: CheckpointKey;
  onPick: (k: CheckpointKey) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-checkpoint-chips-large" role="tablist" aria-label="בחירת נקודת זמן">
      {items.map((cp) => {
        const isActive = cp.key === active;
        return (
          <motion.button
            key={cp.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className="aurora-checkpoint-chip-large"
            data-aurora-active={isActive ? "true" : "false"}
            onClick={() => onPick(cp.key)}
            whileTap={reduced ? undefined : { scale: 0.96 }}
          >
            {isActive ? (
              <motion.span
                layoutId="aurora-checkpoint-pill"
                aria-hidden
                className="aurora-checkpoint-pill-bg"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="aurora-checkpoint-chip-text">{cp.shortLabel}</span>
            {cp.daysUntil > 0 ? (
              <span className="aurora-checkpoint-chip-meta">
                +{cp.daysUntil}י׳
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

function BreakdownGrid({
  checkpoint,
  live,
}: {
  checkpoint: AuroraCheckpointBreakdown;
  live: number;
}) {
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow>פירוט מנוע</Eyebrow>
        <span className="aurora-body aurora-ink-3">
          כל מספר מגיע ממנוע התחזית של Pulse — אין כאן הערכות חדשות.
        </span>
      </div>

      <div className="aurora-cp-breakdown">
        <Cell
          eyebrow="יתרה זמינה"
          amount={live}
          accent="var(--aurora-ink-1)"
        />
        <Cell
          eyebrow="יתרה צפויה"
          amount={checkpoint.expectedBalance}
          accent={toneColor(checkpoint.state)}
          highlight
        />
        <Cell
          eyebrow="הכנסה צפויה"
          amount={checkpoint.incomeArriving}
          accent="var(--aurora-state-safe)"
          sign="+"
        />
        <Cell
          eyebrow="חיובים צפויים"
          amount={checkpoint.outflowLeaving}
          accent="var(--aurora-state-watch)"
          sign="−"
        />
        <Cell
          eyebrow="חיובי כרטיסים"
          amount={checkpoint.cardsCharges}
          accent="var(--aurora-lane-card)"
          sign="−"
        />
        <Cell
          eyebrow="הלוואות"
          amount={checkpoint.loansPaid}
          accent="var(--aurora-lane-loan)"
          sign="−"
        />
        <Cell
          eyebrow="הוראות קבע"
          amount={checkpoint.bankDebits}
          accent="var(--aurora-lane-bank)"
          sign="−"
        />
        <Cell
          eyebrow="מזומן"
          amount={checkpoint.cashOutflow}
          accent="var(--aurora-lane-cash)"
          sign="−"
        />
      </div>

      <div className="aurora-cp-disposable" data-aurora-tone={checkpoint.state}>
        <span className="aurora-cp-disposable-eyebrow">פנוי בסוף החודש</span>
        <span dir="ltr" className="aurora-cp-disposable-amount">
          {signedAmount(checkpoint.disposableAtEom)}
        </span>
        <span className="aurora-cp-disposable-note">
          {checkpoint.salaryEventsCount > 0
            ? `כולל ${checkpoint.salaryEventsCount} משכורות שיגיעו עד התאריך הזה.`
            : "אין הכנסות צפויות עד התאריך הזה. שמור על הקצב."}
        </span>
      </div>
    </GlassCard>
  );
}

function Cell({
  eyebrow,
  amount,
  accent,
  sign,
  highlight,
}: {
  eyebrow: string;
  amount: number;
  accent: string;
  sign?: "+" | "−";
  highlight?: boolean;
}) {
  const display =
    amount === 0
      ? "—"
      : sign
        ? `${sign}${ILS.format(Math.abs(amount))}`
        : signedAmount(amount);
  return (
    <div
      className="aurora-cp-cell"
      data-aurora-highlight={highlight ? "true" : "false"}
      style={{ borderColor: highlight ? accent : "var(--aurora-hairline-quiet)" }}
    >
      <span className="aurora-cp-cell-eyebrow">{eyebrow}</span>
      <span dir="ltr" className="aurora-cp-cell-amount" style={{ color: accent }}>
        {display}
      </span>
    </div>
  );
}

function EventLane({ checkpoint }: { checkpoint: AuroraCheckpointBreakdown }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollLeft = scroller.current.scrollWidth;
    }
  }, [checkpoint.key]);
  if (checkpoint.events.length === 0) {
    return (
      <GlassCard elevation="elev-1" padding="comfortable" radius="hero">
        <Eyebrow>אירועים בדרך</Eyebrow>
        <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
          אין אירועי תזרים בין עכשיו לנקודה הזו. הכרטיס שלמעלה מציג מצב יציב.
        </p>
      </GlassCard>
    );
  }
  return (
    <GlassCard elevation="elev-1" padding="comfortable" radius="hero">
      <Eyebrow>אירועי תזרים עד הנקודה</Eyebrow>
      <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
        כל אירוע ידחוף את היתרה למעלה או למטה. סדר כרונולוגי, מהקרוב לרחוק.
      </p>
      <div className="aurora-cp-event-lane" ref={scroller}>
        {checkpoint.events.map((e, i) => (
          <div key={`${e.whenISO}-${i}`} className="aurora-cp-event-pill">
            <span
              aria-hidden
              className="aurora-cp-event-dot"
              style={{ background: kindColor(e.kind) }}
            />
            <span className="aurora-cp-event-label">{e.label}</span>
            <span dir="ltr" className="aurora-cp-event-amount" style={{ color: kindColor(e.kind) }}>
              {e.amount >= 0 ? "+" : "−"}
              {ILS.format(Math.abs(e.amount))}
            </span>
            <span className="aurora-cp-event-when">
              {FULL_DATE.format(new Date(e.whenISO))}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function kindColor(kind: AuroraCheckpointBreakdown["events"][number]["kind"]): string {
  switch (kind) {
    case "income":
      return "var(--aurora-state-safe)";
    case "card":
      return "var(--aurora-lane-card)";
    case "loan":
      return "var(--aurora-lane-loan)";
    case "bank_debit":
    default:
      return "var(--aurora-lane-bank)";
  }
}
