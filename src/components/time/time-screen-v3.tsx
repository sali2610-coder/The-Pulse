"use client";

// Time · v3 · "Financial Time Machine".
//
// UI/UX-only. Data comes from useTimeEngine — no calculation,
// forecast, store, API, or business logic touched here. The
// experience is built around the balance river hero: user picks
// a checkpoint and watches the balance curve, cursor, floating
// numbers, and insight cards animate to the new frame.

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
  type TimeFrame,
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
const DATE_FMT_SHORT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
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

function labelForKind(k: CheckpointKind): string {
  switch (k) {
    case "day10":
      return "ה-10 בחודש";
    case "eom":
      return "סוף החודש";
    case "next2":
      return "2 בחודש הבא";
    case "next10":
      return "10 בחודש הבא";
    default:
      return k;
  }
}

function shortLabel(k: CheckpointKind): string {
  switch (k) {
    case "day10":
      return "10";
    case "eom":
      return "סוף חודש";
    case "next2":
      return "2 הבא";
    case "next10":
      return "10 הבא";
    default:
      return k;
  }
}

// ── Root ────────────────────────────────────────────────────

export function TimeScreenV3() {
  const [kind, setKind] = useState<CheckpointKind>("eom");

  const seed = useTimeEngine(null);
  const activeCheckpoint = useMemo<Checkpoint | null>(() => {
    return (
      seed.checkpoints.find((c) => c.kind === kind) ??
      seed.checkpoints.find((c) => c.kind === "eom") ??
      seed.checkpoints[0] ??
      null
    );
  }, [seed.checkpoints, kind]);

  const frame = useTimeEngine(activeCheckpoint?.offset ?? null);
  const reduced = useReducedMotion();

  if (!frame.ready || frame.noAnchors || !activeCheckpoint) {
    return <EmptyState reason={frame.noAnchors ? "no-anchors" : "loading"} />;
  }

  const confidence = confidenceOf(
    frame.balance,
    frame.health?.band ?? undefined,
  );

  return (
    <div className="tm-stack" dir="rtl">
      <TmHeader />

      <BalanceRiver
        frame={frame}
        confidence={confidence}
        activeKind={activeCheckpoint.kind}
      />

      <CheckpointNav
        seed={seed}
        activeKind={activeCheckpoint.kind}
        onPick={setKind}
        reduced={Boolean(reduced)}
      />

      <StorySentence
        frame={frame}
        confidence={confidence}
        activeKind={activeCheckpoint.kind}
      />

      <InsightGrid
        key={activeCheckpoint.kind}
        frame={frame}
        activeKind={activeCheckpoint.kind}
      />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────

function TmHeader() {
  return (
    <header className="tm-header">
      <span className="tm-header-eyebrow">SALLY · TIME MACHINE</span>
      <span className="tm-header-title">מסע קדימה בזמן</span>
      <span className="tm-header-hint">
        בחר יעד ותראה איך העתיד הכספי שלך משתנה
      </span>
    </header>
  );
}

// ── Balance River (hero) ────────────────────────────────────
//
// SVG line chart drawn from frame.curve. The full 35-day balance
// series is rendered as a soft ghost curve; the segment from today
// up to the active checkpoint is drawn on top in confidence-tinted
// gold/green/red gradient with area fill. A pulsing cursor marker
// sits at the active checkpoint. Big balance number floats above.

function BalanceRiver({
  frame,
  confidence,
  activeKind,
}: {
  frame: TimeFrame;
  confidence: Confidence;
  activeKind: CheckpointKind;
}) {
  const reduced = useReducedMotion();
  const curve = frame.curve;
  const cursor = frame.cursorOffset;
  const iso = frame.cursorISO;

  const W = 720;
  const H = 260;
  const PAD_X = 24;
  const PAD_TOP = 40;
  const PAD_BOTTOM = 44;

  const shape = useMemo(() => {
    if (!curve || curve.points.length === 0) return null;
    const pts = curve.points;
    const max = Math.max(...pts.map((p) => p.balance), 0);
    const min = Math.min(...pts.map((p) => p.balance), 0);
    const range = max - min || 1;
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_X + (i / (pts.length - 1)) * innerW;
    const y = (v: number) =>
      PAD_TOP + innerH - ((v - min) / range) * innerH;
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(" ");
    const cursorIdx = Math.max(0, Math.min(pts.length - 1, cursor));
    const activePath = pts
      .slice(0, cursorIdx + 1)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(" ");
    const areaPath = `${activePath} L${x(cursorIdx).toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} Z`;
    const cursorX = x(cursorIdx);
    const cursorY = y(pts[cursorIdx]?.balance ?? 0);
    const zeroY = min < 0 && max > 0 ? y(0) : null;
    return { path, activePath, areaPath, cursorX, cursorY, zeroY, x, y, max, min };
  }, [curve, cursor]);

  if (!shape || !curve) return null;

  const tone =
    confidence === "danger"
      ? "var(--sally-danger)"
      : confidence === "watch"
        ? "var(--sally-watch)"
        : "var(--sally-safe)";

  const moodLabel =
    confidence === "danger"
      ? "🔴 סיכון זמני"
      : confidence === "watch"
        ? "🟡 דורש תשומת לב"
        : "🟢 שליטה מלאה";

  return (
    <motion.section
      className="tm-river"
      data-tone={confidence}
      aria-label="נהר יתרה על ציר הזמן"
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        duration: reduced ? 0.12 : 0.55,
      }}
    >
      <span aria-hidden className="tm-river-aurora" />
      <span aria-hidden className="tm-river-halo" />
      <span aria-hidden className="tm-river-pulse" />
      <div className="tm-river-status" aria-live="polite">
        <span className="tm-river-status-dot" aria-hidden />
        <span className="tm-river-status-text">
          🧠 AI Forecast Active · {moodLabel}
        </span>
      </div>
      <div className="tm-river-head">
        <div className="tm-river-title-block">
          <span className="tm-river-eyebrow">{labelForKind(activeKind)}</span>
          <span className="tm-river-date">
            {iso ? DATE_FMT.format(new Date(iso)) : ""}
          </span>
        </div>
        <ConfidencePill confidence={confidence} />
      </div>

      <div className="tm-river-hero">
        <span className="tm-river-hero-label">יתרה צפויה</span>
        <div
          className="tm-river-hero-balance"
          dir="ltr"
          data-tone={confidence}
        >
          <AnimatedNumber
            value={frame.balance}
            format={(n) =>
              (n < 0 ? "−" : "") + ILS.format(Math.round(Math.abs(n)))
            }
          />
        </div>
        <span className="tm-river-hero-days" dir="rtl">
          {frame.cursorOffset === 0
            ? "היום"
            : frame.cursorOffset === 1
              ? "מחר"
              : `בעוד ${frame.cursorOffset} ימים`}
        </span>
      </div>

      <div className="tm-river-chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="tm-river-svg"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="tm-river-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity="0.45" />
              <stop offset="100%" stopColor={tone} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tm-river-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={tone} stopOpacity="0.85" />
              <stop offset="100%" stopColor={tone} stopOpacity="1" />
            </linearGradient>
            <filter id="tm-river-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          {shape.zeroY !== null ? (
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={shape.zeroY}
              y2={shape.zeroY}
              stroke="rgba(248,113,113,0.35)"
              strokeDasharray="4 6"
              strokeWidth="1"
            />
          ) : null}

          <path
            d={shape.path}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          <motion.path
            d={shape.areaPath}
            fill="url(#tm-river-fill)"
            initial={reduced ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, ease: EASE }}
          />

          {/* Blurred underlay for the aura glow */}
          <motion.path
            key={`glow-${activeKind}`}
            d={shape.activePath}
            fill="none"
            stroke="url(#tm-river-stroke)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.55"
            filter="url(#tm-river-glow)"
            initial={reduced ? undefined : { pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={{ duration: reduced ? 0.12 : 1.0, ease: EASE }}
          />
          {/* Sharp active stroke on top */}
          <motion.path
            key={`stroke-${activeKind}`}
            d={shape.activePath}
            fill="none"
            stroke="url(#tm-river-stroke)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? undefined : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
          />

          {/* Cursor: idle breathing dot on top of pulsing ring */}
          <motion.circle
            cx={shape.cursorX}
            cy={shape.cursorY}
            r={6}
            fill={tone}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={
              reduced
                ? { scale: 1, opacity: 1 }
                : { scale: [1, 1.12, 1], opacity: 1 }
            }
            transition={{
              duration: reduced ? 0.12 : 3.6,
              repeat: reduced ? 0 : Infinity,
              ease: EASE,
            }}
            filter="url(#tm-river-glow)"
          />
          <motion.circle
            cx={shape.cursorX}
            cy={shape.cursorY}
            r={14}
            fill="none"
            stroke={tone}
            strokeOpacity="0.35"
            strokeWidth="2"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={
              reduced
                ? { scale: 1, opacity: 0.35 }
                : { scale: [0.6, 1.6, 1], opacity: [0.9, 0, 0] }
            }
            transition={{
              duration: 1.6,
              repeat: reduced ? 0 : Infinity,
              ease: EASE,
            }}
          />
          <line
            x1={shape.cursorX}
            x2={shape.cursorX}
            y1={PAD_TOP}
            y2={H - PAD_BOTTOM}
            stroke={tone}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        </svg>

        <div className="tm-river-scale">
          <span dir="ltr">{ILS.format(Math.round(shape.max))}</span>
          <span dir="ltr">{ILS.format(Math.round(shape.min))}</span>
        </div>
      </div>
    </motion.section>
  );
}

// ── Checkpoint navigator ───────────────────────────────────

function CheckpointNav({
  seed,
  activeKind,
  onPick,
  reduced,
}: {
  seed: TimeFrame;
  activeKind: CheckpointKind;
  onPick: (k: CheckpointKind) => void;
  reduced: boolean;
}) {
  const nav = useMemo(
    () =>
      NAV_KINDS.map((k) => seed.checkpoints.find((c) => c.kind === k)).filter(
        (c): c is Checkpoint => Boolean(c),
      ),
    [seed.checkpoints],
  );
  if (nav.length === 0) return null;

  return (
    <nav
      className="tm-nav"
      role="tablist"
      aria-label="בחירת נקודת זמן עתידית"
    >
      {nav.map((cp) => (
        <CheckpointCard
          key={cp.kind}
          cp={cp}
          active={cp.kind === activeKind}
          onPick={() => onPick(cp.kind)}
          reduced={reduced}
        />
      ))}
    </nav>
  );
}

function CheckpointCard({
  cp,
  active,
  onPick,
  reduced,
}: {
  cp: Checkpoint;
  active: boolean;
  onPick: () => void;
  reduced: boolean;
}) {
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onPick}
      className="tm-nav-card"
      data-active={active ? "true" : undefined}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      {active ? (
        <motion.span
          layoutId="tm-nav-glow"
          aria-hidden
          className="tm-nav-glow"
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 34,
            duration: reduced ? 0.12 : undefined,
          }}
        />
      ) : null}
      <span className="tm-nav-card-eyebrow">
        {DATE_FMT_SHORT.format(new Date(cp.iso))}
      </span>
      <span className="tm-nav-card-title">{shortLabel(cp.kind)}</span>
      <span className="tm-nav-card-days" dir="ltr">
        +{cp.offset} ימים
      </span>
    </motion.button>
  );
}

// ── Confidence pill ────────────────────────────────────────

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span className="tm-confidence" data-tone={confidence}>
      <span aria-hidden className="tm-confidence-dot" />
      {confidenceLabel(confidence)}
    </span>
  );
}

// ── Story sentence ─────────────────────────────────────────

function StorySentence({
  frame,
  confidence,
  activeKind,
}: {
  frame: TimeFrame;
  confidence: Confidence;
  activeKind: CheckpointKind;
}) {
  const sentence = useMemo(
    () => composeStory(frame, confidence, activeKind),
    [frame, confidence, activeKind],
  );
  return (
    <p className="tm-story" dir="rtl">
      {sentence}
    </p>
  );
}

function composeStory(
  frame: TimeFrame,
  confidence: Confidence,
  activeKind: CheckpointKind,
): string {
  const parts: string[] = [];
  const events = eventsBetween(frame, activeKind);
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
        ? "נותרה משכורת אחת בדרך."
        : `נותרו ${salaryCount} משכורות בדרך.`,
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

// ── Events helpers ─────────────────────────────────────────

function eventsBetween(
  frame: TimeFrame,
  activeKind?: CheckpointKind,
): Array<{
  whenISO: string;
  label: string;
  amount: number;
  kind: "income" | "card" | "loan" | "bank_debit";
}> {
  if (!frame.curve) return [];
  const cursor = frame.cursorOffset;

  // The liquidity curve attaches past-month debits and past-month
  // loan/rule installments to dayIndex=0 for user traceability (so
  // LIVE can annotate the balance with "how did we get here?"). The
  // Time tiles must NOT surface those past events: the tile answers
  // the question "what happens INSIDE the checkpoint window".
  //
  // Filters applied in order:
  //   1. Skip `informational` events — already inside anchor.
  //   2. Skip events with calendar date before today's start of day
  //      (they belong to the balance ring, not to a forward tile).
  //   3. Per-checkpoint window filter — the point of THIS pass:
  //      · day10  → only current-month events with day-of-month ≤ 10
  //      · eom    → only current-month events (any day up to EOM)
  //      · next2  → only next-month events with day-of-month ≤ 2
  //      · next10 → only next-month events with day-of-month ≤ 10
  //      · other  → default cumulative-to-cursor slice (LIVE, custom)
  //      No cumulative bleed across the current-month → next-month
  //      boundary; each tile shows the events that belong to its
  //      own checkpoint's calendar month.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startTs = startOfToday.getTime();
  const nowYear = startOfToday.getFullYear();
  const nowMonth = startOfToday.getMonth();
  const nextMonthDate = new Date(nowYear, nowMonth + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();

  function inWindow(eventTs: number): boolean {
    if (!Number.isFinite(eventTs)) return false;
    const d = new Date(eventTs);
    const eY = d.getFullYear();
    const eM = d.getMonth();
    const eDay = d.getDate();
    if (activeKind === "day10") {
      return eY === nowYear && eM === nowMonth && eDay <= 10;
    }
    if (activeKind === "eom") {
      return eY === nowYear && eM === nowMonth;
    }
    if (activeKind === "next2") {
      return eY === nextYear && eM === nextMonth && eDay <= 2;
    }
    if (activeKind === "next10") {
      return eY === nextYear && eM === nextMonth && eDay <= 10;
    }
    // Fallback (LIVE / custom / undefined) — cumulative up to cursor.
    return true;
  }

  const out: Array<{
    whenISO: string;
    label: string;
    amount: number;
    kind: "income" | "card" | "loan" | "bank_debit";
  }> = [];
  for (const p of frame.curve.points) {
    if (p.dayIndex < 0 || p.dayIndex > cursor) continue;
    for (const e of p.events) {
      if (e.informational) continue;
      const eventTs = new Date(e.whenISO).getTime();
      if (Number.isFinite(eventTs) && eventTs < startTs) continue;
      if (!inWindow(eventTs)) continue;
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
// ── Insight grid ──────────────────────────────────────────

type LaneKey = "income" | "bank_debit" | "loan" | "card";
type LaneMeta = {
  key: LaneKey;
  eyebrow: string;
  tone: "safe" | "watch" | "lane-loan" | "lane-card";
  glyph: React.ReactNode;
  sign: "+" | "−";
  emptyLabel: string;
  singularLabel: (n: number) => string;
};

const LANES: LaneMeta[] = [
  {
    key: "income",
    eyebrow: "נכנס",
    tone: "safe",
    glyph: <GlyphIn />,
    sign: "+",
    emptyLabel: "אין הפקדה עד הצ׳קפוינט",
    singularLabel: (n) => (n === 1 ? "הפקדה אחת" : `${n} הפקדות`),
  },
  {
    key: "bank_debit",
    eyebrow: "חיובי בנק",
    tone: "watch",
    glyph: <GlyphBill />,
    sign: "−",
    emptyLabel: "אין חיובי בנק",
    singularLabel: (n) => (n === 1 ? "חיוב אחד" : `${n} חיובים`),
  },
  {
    key: "loan",
    eyebrow: "הלוואות",
    tone: "lane-loan",
    glyph: <GlyphLoan />,
    sign: "−",
    emptyLabel: "אף הלוואה לא ירדה",
    singularLabel: (n) => (n === 1 ? "הלוואה אחת" : `${n} הלוואות`),
  },
  {
    key: "card",
    eyebrow: "אשראי",
    tone: "lane-card",
    glyph: <GlyphCard />,
    sign: "−",
    emptyLabel: "אין חיובי אשראי",
    singularLabel: (n) => (n === 1 ? "חיוב אחד" : `${n} חיובים`),
  },
];

function InsightGrid({
  frame,
  activeKind,
}: {
  frame: TimeFrame;
  activeKind: CheckpointKind;
}) {
  const [openLane, setOpenLane] = useState<LaneKey | null>(null);
  const events = useMemo(
    () => eventsBetween(frame, activeKind),
    [frame, activeKind],
  );

  // Recompute per lane. Every number here is derived from
  // frame.curve[0..cursor] — so tiles ARE the story of the balance
  // reached at the selected checkpoint.
  const perLane = useMemo(() => {
    const m = new Map<LaneKey, typeof events>();
    for (const l of LANES) m.set(l.key, []);
    for (const e of events) {
      const bucket = m.get(e.kind);
      if (bucket) bucket.push(e);
    }
    return m;
  }, [events]);
  const cursorDate = new Date(frame.cursorISO);

  return (
    <div className="tm-insight-wrap" data-open={openLane ?? undefined}>
      <div className="tm-insight-caption" dir="rtl">
        <span>מה השפיע על היתרה עד</span>
        <span
          className="tm-insight-caption-date"
          data-mono="true"
          dir="ltr"
        >
          {DATE_FMT.format(cursorDate)}
        </span>
      </div>
      <div className="tm-insight-grid">
        {LANES.map((lane) => {
          const rows = perLane.get(lane.key) ?? [];
          const total = rows.reduce(
            (s, r) => s + Math.abs(r.amount),
            0,
          );
          const isOpen = openLane === lane.key;
          const isDimmed = openLane !== null && !isOpen;
          return (
            <InsightTile
              key={lane.key}
              lane={lane}
              rows={rows}
              total={total}
              active={isOpen}
              dimmed={isDimmed}
              onToggle={() =>
                setOpenLane((prev) => (prev === lane.key ? null : lane.key))
              }
            />
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {openLane ? (
          <LaneExpansion
            key={`${openLane}-${frame.cursorISO}`}
            lane={LANES.find((l) => l.key === openLane) as LaneMeta}
            rows={perLane.get(openLane) ?? []}
            cursorISO={frame.cursorISO}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function InsightTile({
  lane,
  rows,
  total,
  active,
  dimmed,
  onToggle,
}: {
  lane: LaneMeta;
  rows: ReturnType<typeof eventsBetween>;
  total: number;
  active: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const count = rows.length;
  // Single-event tile shows the event label directly so the tile
  // reads as the reason for the balance ('לימודים' / 'משכורת' /
  // 'רכב'), not an abstract count. Two-plus events fall back to the
  // 'N חיובים' summary.
  const sub =
    count === 0
      ? lane.emptyLabel
      : count === 1
        ? rows[0].label
        : lane.singularLabel(count);
  return (
    <motion.button
      type="button"
      className="tm-insight"
      data-tone={lane.tone}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onToggle}
      aria-expanded={active}
      aria-label={`${lane.eyebrow} · ${count} פריטים`}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 34,
        duration: reduced ? 0.12 : undefined,
      }}
    >
      <span aria-hidden className="tm-insight-glyph">
        {lane.glyph}
      </span>
      <span className="tm-insight-eyebrow">{lane.eyebrow}</span>
      <span className="tm-insight-value" dir="ltr">
        {lane.sign}
        <AnimatedNumber
          value={total}
          format={(n) => ILS.format(Math.round(n))}
        />
      </span>
      <span className="tm-insight-sub">{sub}</span>
    </motion.button>
  );
}

function LaneExpansion({
  lane,
  rows,
  cursorISO,
}: {
  lane: LaneMeta;
  rows: ReturnType<typeof eventsBetween>;
  cursorISO: string;
}) {
  const reduced = useReducedMotion();
  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  const cursorDate = new Date(cursorISO);
  return (
    <motion.section
      layout
      className="tm-lane"
      data-tone={lane.tone}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
        duration: reduced ? 0.12 : undefined,
      }}
      aria-label={`${lane.eyebrow} — פירוט האירועים`}
    >
      <header className="tm-lane-head">
        <div className="tm-lane-head-text">
          <span className="tm-lane-eyebrow">{lane.eyebrow}</span>
          <span className="tm-lane-window">
            עד {DATE_FMT.format(cursorDate)}
          </span>
        </div>
        <div className="tm-lane-head-right">
          <span className="tm-lane-total" data-mono="true" dir="ltr">
            {lane.sign}
            {ILS.format(Math.round(total))}
          </span>
          <span className="tm-lane-count" data-mono="true" dir="ltr">
            {rows.length}
          </span>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="tm-lane-empty">אין אירועים עד הצ׳קפוינט.</div>
      ) : (
        <ul className="tm-lane-list">
          {rows.map((r, i) => (
            <motion.li
              key={`${r.whenISO}-${i}`}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: Math.min(i * 0.03, 0.18),
                duration: reduced ? 0.12 : 0.32,
                ease: EASE,
              }}
              className="tm-lane-row"
            >
              <span aria-hidden className="tm-lane-rail" />
              <div className="tm-lane-body">
                <span className="tm-lane-title">{r.label}</span>
                <span className="tm-lane-date" data-mono="true" dir="ltr">
                  {DATE_FMT.format(new Date(r.whenISO))}
                </span>
              </div>
              <span
                className="tm-lane-amount"
                data-mono="true"
                dir="ltr"
              >
                {lane.sign}
                {ILS.format(Math.round(Math.abs(r.amount)))}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

// ── Glyphs ─────────────────────────────────────────────────

function GlyphIn() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 4v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GlyphLoan() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="6" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function GlyphCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="5" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function GlyphBill() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 3h10v14l-2-2-2 2-2-2-2 2-2-2V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 8h4M8 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
// ── Empty state ────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-anchors" | "loading" }) {
  return (
    <div className="tm-empty" dir="rtl">
      <span aria-hidden className="tm-empty-orb" />
      <span className="tm-empty-title">
        {reason === "no-anchors" ? "הגדר עוגן ראשון" : "טוען את הציר…"}
      </span>
      <span className="tm-empty-hint">
        {reason === "no-anchors"
          ? "כדי לחזות את העתיד, סאלי צריכה יתרת בנק ראשונית."
          : "רק רגע."}
      </span>
    </div>
  );
}
