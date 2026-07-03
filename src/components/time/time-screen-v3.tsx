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

      <StorySentence frame={frame} confidence={confidence} />

      <InsightGrid frame={frame} confidence={confidence} />

      <div className="tm-lists">
        <TmList
          title="חיובים בדרך"
          eyebrow="עד הצ׳קפוינט"
          events={outflowsBetween(frame)}
        />
        <TmList
          title="הכנסות בדרך"
          eyebrow="עד הצ׳קפוינט"
          events={inflowsBetween(frame)}
          positive
        />
      </div>
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

  return (
    <section className="tm-river" aria-label="נהר יתרה על ציר הזמן">
      <span aria-hidden className="tm-river-aurora" />
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

          <motion.path
            key={`stroke-${activeKind}`}
            d={shape.activePath}
            fill="none"
            stroke="url(#tm-river-stroke)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#tm-river-glow)"
            initial={reduced ? undefined : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
          />

          <motion.circle
            cx={shape.cursorX}
            cy={shape.cursorY}
            r={6}
            fill={tone}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: EASE }}
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
    </section>
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
}: {
  frame: TimeFrame;
  confidence: Confidence;
}) {
  const sentence = useMemo(
    () => composeStory(frame, confidence),
    [frame, confidence],
  );
  return (
    <p className="tm-story" dir="rtl">
      {sentence}
    </p>
  );
}

function composeStory(frame: TimeFrame, confidence: Confidence): string {
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

function eventsBetween(frame: TimeFrame): Array<{
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
function outflowsBetween(frame: TimeFrame) {
  return eventsBetween(frame).filter((e) => e.amount < 0);
}
function inflowsBetween(frame: TimeFrame) {
  return eventsBetween(frame).filter((e) => e.amount > 0);
}

// ── Insight grid ──────────────────────────────────────────

function InsightGrid({
  frame,
  confidence,
}: {
  frame: TimeFrame;
  confidence: Confidence;
}) {
  const events = eventsBetween(frame);
  const inflows = events.filter((e) => e.amount > 0);
  const outflows = events.filter((e) => e.amount < 0);
  const salary = inflows
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + e.amount, 0);
  const salaryCount = inflows.filter((e) => e.kind === "income").length;
  const loans = outflows
    .filter((e) => e.kind === "loan")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const loanCount = outflows.filter((e) => e.kind === "loan").length;
  const cards = outflows
    .filter((e) => e.kind === "card")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const cardCount = outflows.filter((e) => e.kind === "card").length;
  const bills = outflows
    .filter((e) => e.kind === "bank_debit")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const billCount = outflows.filter((e) => e.kind === "bank_debit").length;
  const netFlow = frame.windowInflow - frame.windowOutflow;

  const safeUntil = useMemo(() => {
    if (!frame.curve) return null;
    for (const p of frame.curve.points) {
      if (p.balance < 0) {
        return p.whenISO;
      }
    }
    return null;
  }, [frame.curve]);

  return (
    <div className="tm-insight-grid">
      <InsightCard
        eyebrow="שכר צפוי"
        value={salary}
        sub={
          salaryCount === 0
            ? "אין הפקדה עד הצ׳קפוינט"
            : salaryCount === 1
              ? "הפקדה אחת בדרך"
              : `${salaryCount} הפקדות בדרך`
        }
        tone="safe"
        glyph={<GlyphIn />}
      />
      <InsightCard
        eyebrow="הלוואות שירדו"
        value={loans}
        sub={
          loanCount === 0
            ? "אף הלוואה לא ירדה"
            : loanCount === 1
              ? "הלוואה אחת ירדה"
              : `${loanCount} הלוואות ירדו`
        }
        tone="lane-loan"
        glyph={<GlyphLoan />}
      />
      <InsightCard
        eyebrow="הוצאות אשראי"
        value={cards}
        sub={
          cardCount === 0
            ? "אין חיובי אשראי"
            : `${cardCount} חיובי אשראי`
        }
        tone="lane-card"
        glyph={<GlyphCard />}
      />
      <InsightCard
        eyebrow="חשבונות ממתינים"
        value={bills}
        sub={
          billCount === 0
            ? "אין חשבונות ממתינים"
            : `${billCount} חשבונות ממתינים`
        }
        tone="watch"
        glyph={<GlyphBill />}
      />
      <InsightCard
        eyebrow="בטוח עד"
        value={safeUntil ? null : frame.balance}
        rawText={
          safeUntil
            ? DATE_FMT.format(new Date(safeUntil))
            : "לאורך כל הטווח"
        }
        sub={safeUntil ? "אחר כך היתרה שלילית" : "היתרה חיובית לאורך כל הדרך"}
        tone={safeUntil ? "danger" : "safe"}
        glyph={<GlyphClock />}
        textPrimary
      />
      <InsightCard
        eyebrow={netFlow >= 0 ? "עודף צפוי" : "גירעון צפוי"}
        value={Math.abs(netFlow)}
        sub={
          netFlow >= 0
            ? "הכנסות עולות על יציאות"
            : "יציאות עולות על הכנסות"
        }
        tone={confidence === "danger" ? "danger" : netFlow >= 0 ? "safe" : "watch"}
        glyph={<GlyphNet />}
      />
    </div>
  );
}

function InsightCard({
  eyebrow,
  value,
  sub,
  tone,
  glyph,
  rawText,
  textPrimary,
}: {
  eyebrow: string;
  value: number | null;
  sub: string;
  tone: "safe" | "watch" | "danger" | "lane-loan" | "lane-card" | "neutral";
  glyph: React.ReactNode;
  rawText?: string;
  textPrimary?: boolean;
}) {
  return (
    <div className="tm-insight" data-tone={tone}>
      <span aria-hidden className="tm-insight-glyph">
        {glyph}
      </span>
      <span className="tm-insight-eyebrow">{eyebrow}</span>
      {textPrimary && rawText ? (
        <span className="tm-insight-text" dir="rtl">
          {rawText}
        </span>
      ) : value !== null ? (
        <span className="tm-insight-value" dir="ltr">
          <AnimatedNumber
            value={value}
            format={(n) => ILS.format(Math.round(n))}
          />
        </span>
      ) : null}
      <span className="tm-insight-sub">{sub}</span>
    </div>
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
function GlyphClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function GlyphNet() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 14l4-4 3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Expandable event lists ─────────────────────────────────

function TmList({
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
  const total = events.reduce((s, e) => s + Math.abs(e.amount), 0);
  return (
    <section className="tm-list">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tm-list-head"
      >
        <div className="tm-list-head-text">
          <span className="tm-list-eyebrow">{eyebrow}</span>
          <span className="tm-list-title">{title}</span>
        </div>
        <div className="tm-list-head-right">
          <span className="tm-list-total" dir="ltr">
            {ILS.format(Math.round(total))}
          </span>
          <span className="tm-list-count">{events.length}</span>
          <motion.span
            aria-hidden
            className="tm-list-arrow"
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
            className="tm-list-body"
          >
            {events.length === 0 ? (
              <li className="tm-list-empty">אין פריטים בטווח.</li>
            ) : (
              events.map((e, i) => (
                <li key={`${e.whenISO}-${i}`} className="tm-list-row">
                  <span aria-hidden className="tm-list-row-rail" data-positive={positive ? "true" : undefined} />
                  <div className="tm-list-row-text">
                    <span className="tm-list-row-title">{e.label}</span>
                    <span className="tm-list-row-meta">
                      {DATE_FMT.format(new Date(e.whenISO))}
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    className="tm-list-row-amount"
                    data-tone={positive ? "safe" : "ink"}
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
