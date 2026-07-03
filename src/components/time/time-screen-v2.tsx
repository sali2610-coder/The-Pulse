"use client";

// Time v2 · signature "traveling through time" screen.
//
// UI-only redesign. Reuses the existing useTimeEngine hook and its
// checkpoint list. No engine, calculation, or store change. Every
// number in this file is engine-derived — this component only
// composes, animates, and formats.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import { AnimatedNumber } from "./animated-number";
import {
  useTimeEngine,
  type Checkpoint,
  type CheckpointKind,
} from "./use-time-engine";

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

const EASE = [0.32, 0.72, 0, 1] as const;

const NAV_KINDS: CheckpointKind[] = ["day10", "eom", "next2", "next10"];

type Confidence = "safe" | "watch" | "danger";

function confidenceOf(balance: number, band?: string): Confidence {
  if (band === "danger" || balance < 0) return "danger";
  if (band === "watch" || balance < 1500) return "watch";
  return "safe";
}

function confidenceLabel(c: Confidence): string {
  if (c === "danger") return "דורש התייחסות";
  if (c === "watch") return "צפוף";
  return "נוח";
}

function labelForKind(kind: CheckpointKind): string {
  switch (kind) {
    case "day10":
      return "ה-10 בחודש";
    case "eom":
      return "סוף החודש";
    case "next2":
      return "2 בחודש הבא";
    case "next10":
      return "10 בחודש הבא";
    default:
      return kind;
  }
}

function shortLabel(kind: CheckpointKind): string {
  switch (kind) {
    case "day10":
      return "10";
    case "eom":
      return "סוף חודש";
    case "next2":
      return "2 הבא";
    case "next10":
      return "10 הבא";
    default:
      return kind;
  }
}

// ── Component ─────────────────────────────────────────────────

export function TimeScreenV2() {
  const [kind, setKind] = useState<CheckpointKind>("eom");

  // First engine read (no offset) to get the checkpoint list.
  const seed = useTimeEngine(null);
  const activeCheckpoint = useMemo<Checkpoint | null>(() => {
    return (
      seed.checkpoints.find((c) => c.kind === kind) ??
      seed.checkpoints.find((c) => c.kind === "eom") ??
      seed.checkpoints[0] ??
      null
    );
  }, [seed.checkpoints, kind]);

  // Engine read at the resolved offset — this is what feeds all
  // animated cards below.
  const frame = useTimeEngine(activeCheckpoint?.offset ?? null);

  const reduced = useReducedMotion();

  if (!frame.ready || frame.noAnchors || !activeCheckpoint) {
    return <EmptyState reason={frame.noAnchors ? "no-anchors" : "loading"} />;
  }

  const confidence = confidenceOf(
    frame.balance,
    frame.health?.band ?? undefined,
  );
  const daysLeft = frame.cursorOffset;
  const iso = frame.cursorISO;

  return (
    <div className="tv2-stack" dir="rtl">
      <header className="tv2-header">
        <span className="tv2-eyebrow">SALLY · TIME</span>
        <span className="tv2-header-hint">
          מסע קדימה בזמן — בחר נקודת יעד
        </span>
      </header>

      <TimelineNav
        checkpoints={seed.checkpoints}
        activeKind={kind}
        onPick={setKind}
      />

      <motion.section
        key={activeCheckpoint.kind}
        className="tv2-hero"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0.12 : 0.55, ease: EASE }}
      >
        <span aria-hidden className="tv2-hero-aurora" />
        <span aria-hidden className="tv2-hero-gloss" />

        <div className="tv2-hero-head">
          <div className="tv2-hero-title-block">
            <span className="tv2-hero-eyebrow">
              {labelForKind(activeCheckpoint.kind)}
            </span>
            <span className="tv2-hero-date">
              {iso ? DATE_FMT.format(new Date(iso)) : ""}
            </span>
          </div>
          <ConfidencePill confidence={confidence} />
        </div>

        <div className="tv2-hero-body">
          <div className="tv2-hero-ring">
            <BalanceRing
              balance={frame.balance}
              starting={frame.startingBalance}
              confidence={confidence}
            />
          </div>
          <div className="tv2-hero-text">
            <span className="tv2-hero-label">היתרה הצפויה</span>
            <div
              className="tv2-hero-balance"
              dir="ltr"
              data-aurora-tone={
                frame.balance < 0 ? "danger" : confidence
              }
            >
              <AnimatedNumber
                value={frame.balance}
                format={(n) =>
                  (n < 0 ? "−" : "") + ILS.format(Math.round(Math.abs(n)))
                }
              />
            </div>
            <span className="tv2-hero-days">
              {daysLeft === 0
                ? "היום"
                : daysLeft === 1
                  ? "מחר"
                  : `בעוד ${daysLeft} ימים`}
            </span>
          </div>
        </div>

        <StorySentence frame={frame} confidence={confidence} />
      </motion.section>

      <TileGrid frame={frame} />

      <ExpandableList
        title="חיובים בדרך"
        eyebrow="עד הצ׳קפוינט"
        events={outflowsBetween(frame)}
      />
      <ExpandableList
        title="הכנסות בדרך"
        eyebrow="עד הצ׳קפוינט"
        events={inflowsBetween(frame)}
        positive
      />
    </div>
  );
}

// ── Timeline navigation ───────────────────────────────────────

function TimelineNav({
  checkpoints,
  activeKind,
  onPick,
}: {
  checkpoints: Checkpoint[];
  activeKind: CheckpointKind;
  onPick: (k: CheckpointKind) => void;
}) {
  const reduced = useReducedMotion();
  const nav = useMemo(
    () => NAV_KINDS.map((k) => checkpoints.find((c) => c.kind === k)).filter(
      (c): c is Checkpoint => Boolean(c),
    ),
    [checkpoints],
  );
  if (nav.length === 0) return null;
  const totalOffset = nav[nav.length - 1]?.offset ?? 1;
  const activeIdx = Math.max(0, nav.findIndex((c) => c.kind === activeKind));
  const progressPct = Math.max(
    0,
    Math.min(100, (nav[activeIdx]?.offset ?? 0) / totalOffset * 100),
  );

  return (
    <nav className="tv2-timeline" aria-label="בחירת נקודת זמן">
      <div className="tv2-timeline-track">
        <div className="tv2-timeline-line" />
        <motion.div
          className="tv2-timeline-fill"
          initial={{ width: `${progressPct}%` }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: reduced ? 0.12 : 0.6, ease: EASE }}
        />
        {nav.map((cp) => (
          <TimelineDot
            key={cp.kind}
            cp={cp}
            active={cp.kind === activeKind}
            onClick={() => onPick(cp.kind)}
            totalOffset={totalOffset}
          />
        ))}
      </div>
    </nav>
  );
}

function TimelineDot({
  cp,
  active,
  onClick,
  totalOffset,
}: {
  cp: Checkpoint;
  active: boolean;
  onClick: () => void;
  totalOffset: number;
}) {
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(100, (cp.offset / totalOffset) * 100));
  return (
    <button
      type="button"
      onClick={onClick}
      className="tv2-timeline-dot"
      data-aurora-active={active ? "true" : "false"}
      style={{ insetInlineStart: `${pct}%` }}
      aria-label={`קפוץ ל-${labelForKind(cp.kind)}`}
      aria-pressed={active}
    >
      <span className="tv2-timeline-dot-label">{shortLabel(cp.kind)}</span>
      <span className="tv2-timeline-dot-days" dir="ltr">
        +{cp.offset}י׳
      </span>
      <span aria-hidden className="tv2-timeline-dot-marker">
        {active ? (
          <motion.span
            layoutId="tv2-active-dot"
            className="tv2-timeline-dot-glow"
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 34,
              duration: reduced ? 0.12 : undefined,
            }}
          />
        ) : null}
      </span>
    </button>
  );
}

// ── Confidence pill ─────────────────────────────────────────

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span className="tv2-confidence" data-aurora-tone={confidence}>
      <span aria-hidden className="tv2-confidence-dot" />
      {confidenceLabel(confidence)}
    </span>
  );
}

// ── Story sentence ──────────────────────────────────────────

function StorySentence({
  frame,
  confidence,
}: {
  frame: ReturnType<typeof useTimeEngine>;
  confidence: Confidence;
}) {
  const sentence = useMemo(
    () => composeStory(frame, confidence),
    [frame, confidence],
  );
  return (
    <p className="tv2-story" dir="rtl">
      {sentence}
    </p>
  );
}

function composeStory(
  frame: ReturnType<typeof useTimeEngine>,
  confidence: Confidence,
): string {
  const parts: string[] = [];
  const events = eventsBetween(frame);
  const outCount = events.filter((e) => e.amount < 0).length;
  const inCount = events.filter((e) => e.amount > 0).length;
  const salaryCount = events.filter(
    (e) => e.amount > 0 && e.kind === "income",
  ).length;
  const loanCount = events.filter(
    (e) => e.amount < 0 && e.kind === "loan",
  ).length;

  if (outCount > 0) {
    parts.push(`עד הצ׳קפוינט צפויות לרדת ${outCount} התחייבויות.`);
  } else {
    parts.push("אין חיובים עד הצ׳קפוינט.");
  }
  if (salaryCount > 0) {
    parts.push(
      salaryCount === 1
        ? "נותרה משכורת אחת."
        : `נותרו ${salaryCount} משכורות.`,
    );
  } else if (inCount === 0) {
    parts.push("לא צפויות הכנסות נוספות.");
  }
  if (loanCount > 0) {
    parts.push(
      loanCount === 1
        ? "הלוואה אחת עדיין לא ירדה."
        : `${loanCount} הלוואות עדיין לא ירדו.`,
    );
  }
  if (confidence === "safe") parts.push("המצב יציב.");
  else if (confidence === "watch") parts.push("שים לב למרווח הצפוף.");
  else parts.push("שווה לצמצם כדי לחזור למרווח בטוח.");
  return parts.join(" ");
}

function eventsBetween(
  frame: ReturnType<typeof useTimeEngine>,
): Array<{
  whenISO: string;
  label: string;
  amount: number;
  kind: "income" | "card" | "loan" | "bank_debit";
}> {
  if (!frame.curve) return [];
  const cursor = frame.cursorOffset;
  const out: Array<{
    whenISO: string;
    label: string;
    amount: number;
    kind: "income" | "card" | "loan" | "bank_debit";
  }> = [];
  for (const p of frame.curve.points) {
    if (p.dayIndex < 0 || p.dayIndex > cursor) continue;
    for (const e of p.events) {
      out.push({
        whenISO: e.whenISO,
        label: e.label,
        amount: e.amount,
        kind: e.kind,
      });
    }
  }
  return out.sort(
    (a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
  );
}

function outflowsBetween(frame: ReturnType<typeof useTimeEngine>) {
  return eventsBetween(frame).filter((e) => e.amount < 0);
}
function inflowsBetween(frame: ReturnType<typeof useTimeEngine>) {
  return eventsBetween(frame).filter((e) => e.amount > 0);
}

// ── Tile grid (4 cards) ─────────────────────────────────────

function TileGrid({ frame }: { frame: ReturnType<typeof useTimeEngine> }) {
  const events = eventsBetween(frame);
  const inflows = events.filter((e) => e.amount > 0);
  const outflows = events.filter((e) => e.amount < 0);
  const remainingIn = inflows.reduce((s, e) => s + e.amount, 0);
  const remainingOut = outflows.reduce((s, e) => s + Math.abs(e.amount), 0);
  const biggestOut = outflows.sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  )[0];
  const biggestIn = inflows.sort((a, b) => b.amount - a.amount)[0];

  return (
    <div className="tv2-tiles">
      <Tile
        eyebrow="הכנסה שנותרה"
        value={remainingIn}
        accent="var(--sally-safe)"
        hint={
          inflows.length > 0
            ? `${inflows.length} הפקדות בדרך`
            : "אין הכנסות נותרות"
        }
        icon="+"
      />
      <Tile
        eyebrow="חיובים שנותרו"
        value={remainingOut}
        accent="var(--sally-ink-1)"
        hint={
          outflows.length > 0
            ? `${outflows.length} חיובים בדרך`
            : "אין חיובים נותרים"
        }
        icon="−"
      />
      <Tile
        eyebrow="החיוב הגדול"
        value={biggestOut ? Math.abs(biggestOut.amount) : 0}
        accent="var(--sally-lane-loan)"
        hint={biggestOut ? biggestOut.label : "אין"}
        icon="◐"
      />
      <Tile
        eyebrow="ההפקדה הגדולה"
        value={biggestIn ? biggestIn.amount : 0}
        accent="var(--sally-safe)"
        hint={biggestIn ? biggestIn.label : "אין"}
        icon="◈"
      />
    </div>
  );
}

function Tile({
  eyebrow,
  value,
  accent,
  hint,
  icon,
}: {
  eyebrow: string;
  value: number;
  accent: string;
  hint: string;
  icon: string;
}) {
  return (
    <div className="tv2-tile">
      <div className="tv2-tile-head">
        <span className="tv2-tile-eyebrow">{eyebrow}</span>
        <span aria-hidden className="tv2-tile-icon" style={{ color: accent }}>
          {icon}
        </span>
      </div>
      <div className="tv2-tile-value" dir="ltr" style={{ color: accent }}>
        <AnimatedNumber value={value} format={(n) => ILS.format(Math.round(n))} />
      </div>
      <span className="tv2-tile-hint">{hint}</span>
    </div>
  );
}

// ── Expandable list ────────────────────────────────────────

function ExpandableList({
  title,
  eyebrow,
  events,
  positive,
}: {
  title: string;
  eyebrow: string;
  events: ReturnType<typeof eventsBetween>;
  positive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  return (
    <section className="tv2-list">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tv2-list-head"
      >
        <div>
          <span className="tv2-list-eyebrow">{eyebrow}</span>
          <span className="tv2-list-title">{title}</span>
        </div>
        <div className="tv2-list-summary">
          <span className="tv2-list-count">{events.length}</span>
          <motion.span
            aria-hidden
            className="tv2-list-arrow"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: reduced ? 0.12 : 0.32, ease: EASE }}
          >
            ▸
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.34, ease: EASE }}
            className="tv2-list-body"
          >
            {events.length === 0 ? (
              <li className="tv2-list-empty">אין פריטים בטווח.</li>
            ) : (
              events.map((e, i) => (
                <li key={`${e.whenISO}-${i}`} className="tv2-list-row">
                  <div className="tv2-list-row-text">
                    <span className="tv2-list-row-title">{e.label}</span>
                    <span className="tv2-list-row-meta">
                      {DATE_FMT.format(new Date(e.whenISO))}
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    className="tv2-list-row-amount"
                    data-aurora-tone={positive ? "safe" : "ink"}
                  >
                    {e.amount >= 0 ? "+" : "−"}
                    {ILS.format(Math.abs(Math.round(e.amount)))}
                  </span>
                </li>
              ))
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ── Balance ring ────────────────────────────────────────────

function BalanceRing({
  balance,
  starting,
  confidence,
}: {
  balance: number;
  starting: number;
  confidence: Confidence;
}) {
  const reduced = useReducedMotion();
  const size = 176;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // Ratio: how much of the starting balance the projected balance
  // still represents. Clamped to [0, 1]. 100% = starting balance
  // preserved. Fractional = partial drop.
  const ratio =
    starting > 0
      ? Math.max(0, Math.min(1, balance / starting))
      : balance >= 0
        ? 1
        : 0;
  const dash = circ * ratio;
  const color =
    confidence === "danger"
      ? "var(--sally-danger)"
      : confidence === "watch"
        ? "var(--sally-watch)"
        : "var(--sally-safe)";
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      aria-hidden
      className="tv2-ring"
    >
      <defs>
        <linearGradient id="tv2-ring-glow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.72" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#tv2-ring-glow)"
        strokeWidth={stroke}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={circ}
        initial={reduced ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
      />
    </svg>
  );
}

// ── Empty state ─────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-anchors" | "loading" }) {
  return (
    <div className="tv2-empty" dir="rtl">
      <span aria-hidden className="tv2-empty-orb" />
      <span className="tv2-empty-title">
        {reason === "no-anchors" ? "הגדר עוגן ראשון" : "טוען את הציר…"}
      </span>
      <span className="tv2-empty-hint">
        {reason === "no-anchors"
          ? "כדי לחזות את העתיד, סאלי צריכה יתרת בנק ראשונית."
          : "רק רגע."}
      </span>
    </div>
  );
}
