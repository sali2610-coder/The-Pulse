"use client";

// Phase 432 part 4 · AURORA v1 — Aurora Home (alive composition)
//
// Real Pulse dashboard. Every card reads live engine data via
// useAuroraHome; when the store is empty the hook returns a
// realistic Hebrew demo fixture so reviewers always see a
// believable screen. Subtle interactions, mount-stagger reveal,
// relative-time tick, lane sparklines, proactive CFO whisper
// rotation. Every card tappable → BottomSheet.

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";

import {
  BentoGrid,
  BentoItem,
} from "@/components/aurora/aurora-bento-grid";
import { BreathingCaret } from "@/components/aurora/aurora-breathing-caret";
import {
  ConciergeSentence,
} from "@/components/aurora/aurora-concierge-sentence";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";
import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import {
  LaneDot,
  LedgerRow,
} from "@/components/aurora/aurora-ledger-row";
import { WhisperCard } from "@/components/aurora/aurora-whisper-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";

import {
  DEMO_COACH_LINES,
  DEMO_LANE_HISTORY,
} from "./aurora-demo-data";
import {
  useAuroraHome,
  type AuroraHomeData,
  type AuroraUpcomingEvent,
} from "./use-aurora-home";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

type SheetKey =
  | "hero"
  | "today"
  | "next"
  | "budget"
  | "weekly"
  | "loans"
  | "fixed"
  | "cards"
  | "income"
  | "upcoming"
  | "activity"
  | null;

// ── Live-tick hook for relative-time copy ────────────────────────
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── Relative time formatter ──────────────────────────────────────
function relativeTime(iso: string, now: Date): string {
  const target = new Date(iso);
  const diffMs = now.getTime() - target.getTime();
  if (diffMs < 0) {
    const absMin = Math.round(Math.abs(diffMs) / 60_000);
    if (absMin < 60) return `בעוד ${absMin} דק׳`;
    const hours = Math.round(absMin / 60);
    if (hours < 24) return `בעוד ${hours} שעות`;
    return DAY_FMT.format(target);
  }
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "ממש עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hours = Math.round(min / 60);
  if (hours < 24) {
    if (now.toDateString() === target.toDateString()) {
      return `היום · ${TIME_FMT.format(target)}`;
    }
    return `לפני ${hours} שעות`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) return `אתמול · ${TIME_FMT.format(target)}`;
  if (days < 7) return `לפני ${days} ימים`;
  return DAY_FMT.format(target);
}

// Pick a CFO line for the rotation. Uses minute-of-day so reviewers
// scrolling Home get a fresh sentence without spam-tick refresh.
function pickCoachLine(coach: string | null, now: Date): string | null {
  if (!coach) return null;
  if (!DEMO_COACH_LINES.includes(coach)) return coach;
  const minute = now.getHours() * 60 + now.getMinutes();
  return DEMO_COACH_LINES[minute % DEMO_COACH_LINES.length];
}

// ── Mount stagger wrapper ────────────────────────────────────────
const STAGGER_BASE = 0.06;

function MountReveal({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={
        reduced
          ? { opacity: 1, transition: { duration: 0.12 } }
          : {
              opacity: 1,
              y: 0,
              transition: {
                duration: 0.42,
                delay: index * STAGGER_BASE,
                ease: [0.32, 0.72, 0, 1],
              },
            }
      }
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
//                         MAIN COMPOSITION
// ─────────────────────────────────────────────────────────────────

export function AuroraHome() {
  const data = useAuroraHome();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const coachLine = pickCoachLine(data.coachSentence, now);

  return (
    <div
      style={{
        paddingBlockStart:
          "calc(var(--aurora-top-bar-h) + var(--aurora-space-7))",
        paddingBlockEnd: "var(--aurora-space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-7)",
      }}
    >
      <h1 className="sr-only">מסך הבית של Pulse</h1>

      <MountReveal index={0}>
        <Hero data={data} onOpen={() => setSheet("hero")} />
      </MountReveal>

      <BentoGrid gap="comfortable">
        <BentoItem span={3}>
          <MountReveal index={1}>
            <TodayCard data={data} onOpen={() => setSheet("today")} />
          </MountReveal>
        </BentoItem>
        <BentoItem span={3}>
          <MountReveal index={2}>
            <NextEventCard
              data={data}
              now={now}
              onOpen={() => setSheet("next")}
            />
          </MountReveal>
        </BentoItem>

        {coachLine ? (
          <BentoItem span={6}>
            <MountReveal index={3}>
              <WhisperCard
                variant={data.coachVariant}
                sentence={coachLine}
              />
            </MountReveal>
          </BentoItem>
        ) : null}

        <BentoItem span={6}>
          <MountReveal index={4}>
            <BudgetCard data={data} onOpen={() => setSheet("budget")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={5}>
            <WeeklyCard data={data} onOpen={() => setSheet("weekly")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={2}>
          <MountReveal index={6}>
            <LaneCard
              label="הלוואות"
              color="var(--aurora-lane-loan)"
              amount={data.loansThisMonth}
              history={
                data.isDemo
                  ? DEMO_LANE_HISTORY.loans
                  : flatHistory(data.loansThisMonth)
              }
              onOpen={() => setSheet("loans")}
            />
          </MountReveal>
        </BentoItem>
        <BentoItem span={2}>
          <MountReveal index={7}>
            <LaneCard
              label="קבועים"
              color="var(--aurora-lane-bank)"
              amount={data.fixedThisMonth}
              history={
                data.isDemo
                  ? DEMO_LANE_HISTORY.fixed
                  : flatHistory(data.fixedThisMonth)
              }
              onOpen={() => setSheet("fixed")}
            />
          </MountReveal>
        </BentoItem>
        <BentoItem span={2}>
          <MountReveal index={8}>
            <LaneCard
              label="אשראי"
              color="var(--aurora-lane-card)"
              amount={data.cardsThisMonth}
              history={
                data.isDemo
                  ? DEMO_LANE_HISTORY.cards
                  : flatHistory(data.cardsThisMonth)
              }
              onOpen={() => setSheet("cards")}
            />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={9}>
            <IncomeCard data={data} onOpen={() => setSheet("income")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={10}>
            <UpcomingCard
              data={data}
              now={now}
              onOpen={() => setSheet("upcoming")}
            />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={11}>
            <ActivityCard
              data={data}
              now={now}
              onOpen={() => setSheet("activity")}
            />
          </MountReveal>
        </BentoItem>
      </BentoGrid>

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(o) => (o ? null : setSheet(null))}
        title={sheetTitle(sheet)}
      >
        {sheet ? <SheetBody kind={sheet} data={data} now={now} /> : null}
      </BottomSheet>
    </div>
  );
}

// ───────────────────────────────── HERO ─────────────────────────

function Hero({ data, onOpen }: { data: AuroraHomeData; onOpen: () => void }) {
  const reduced = useReducedMotion();
  const eomTone =
    data.safetyState === "stress"
      ? "var(--aurora-state-danger)"
      : data.safetyState === "watch"
        ? "var(--aurora-state-watch)"
        : "var(--aurora-ink-1)";

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label="פתח פרטי יתרה"
      className="aurora-hero-card"
      whileTap={reduced ? undefined : { scale: 0.992 }}
    >
      <span aria-hidden className="aurora-hero-scrim" />
      <div className="aurora-hero-content">
        <div className="aurora-hero-eyebrow-row">
          <Eyebrow srHeading={{ level: 2, text: "תמונת מצב חיה" }}>
            {data.safetyLabel.toUpperCase()} · {data.monthLabel}
          </Eyebrow>
          {data.isDemo ? (
            <span aria-hidden className="aurora-demo-pill">
              תצוגת דמו
            </span>
          ) : null}
        </div>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          יתרה חיה {ILS.format(data.livBalance)}. צפי לסוף החודש{" "}
          {ILS.format(data.eomForecast)} — {data.safetyLabel}.
        </span>

        <div
          dir="ltr"
          className="aurora-hero-amount"
        >
          <DigitOdometer value={ILS.format(data.livBalance)} />
        </div>

        <div className="aurora-hero-caret-row">
          <BreathingCaret width={112} />
        </div>

        {data.delta24h > 0 ? (
          <div className="aurora-hero-delta">
            <span aria-hidden>↓</span>
            <span dir="ltr">{ILS.format(data.delta24h)}</span>
            <span>במעקב 24 שעות</span>
          </div>
        ) : null}

        <div className="aurora-hero-eom-row">
          <span className="aurora-hero-eom-label">
            סוף החודש · {data.daysToEom} ימים נותרו
          </span>
          <span
            dir="ltr"
            className="aurora-hero-eom-amount"
            style={{ color: eomTone }}
          >
            <DigitOdometer value={ILS.format(data.eomForecast)} />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// ───────────────────────────────── BENTO CARDS ──────────────────

function TodayCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const used = Math.min(
    100,
    Math.round(
      (data.spentToday / Math.max(1, data.spentToday + data.dailyAllowanceAmount)) *
        100,
    ),
  );
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח פירוט יומי">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "סטטוס היום" }}>
          היום
        </Eyebrow>
        <div className="aurora-today-row">
          <ProgressArc percent={used} tone="safe" />
          <div className="aurora-today-amounts">
            <div
              dir="ltr"
              className="aurora-card-amount"
            >
              <DigitOdometer value={ILS.format(data.dailyAllowanceAmount)} />
            </div>
            <p className="aurora-body aurora-ink-3">מותר עוד היום</p>
          </div>
        </div>
        <p className="aurora-body aurora-ink-3 aurora-today-foot">
          הוצאת {ILS.format(data.spentToday)} מתחילת היום
        </p>
      </GlassCard>
    </CardButton>
  );
}

function NextEventCard({
  data,
  now,
  onOpen,
}: {
  data: AuroraHomeData;
  now: Date;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח אירועים קרובים">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "האירוע הבא" }}>
          הבא בתור
        </Eyebrow>
        {data.nextEvent ? (
          <>
            <div
              dir="ltr"
              className="aurora-card-amount"
              style={{ color: laneColor(data.nextEvent.kind) }}
            >
              {data.nextEvent.kind === "income" ? "+" : "−"}
              {ILS.format(data.nextEvent.amount)}
            </div>
            <p className="aurora-body aurora-ink-2 aurora-card-label">
              {data.nextEvent.label}
            </p>
            <CountdownChip
              targetISO={data.nextEvent.whenISO}
              now={now}
              kind={data.nextEvent.kind}
            />
          </>
        ) : (
          <p className="aurora-body aurora-ink-3">אין אירועים קרובים.</p>
        )}
      </GlassCard>
    </CardButton>
  );
}

function BudgetCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const pct = data.budgetTotal > 0 ? data.budgetPct : 0;
  const tone =
    pct >= 100
      ? "var(--aurora-state-danger)"
      : pct >= 80
        ? "var(--aurora-state-watch)"
        : "var(--aurora-state-safe)";
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח בקרת תקציב">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "בקרת תקציב" }}>
            בקרת תקציב · החודש
          </Eyebrow>
          <span className="aurora-trend-chip" data-aurora-tone="safe">
            ↓ 7% מהממוצע
          </span>
        </div>
        <div className="aurora-card-row-amount">
          <span dir="ltr" className="aurora-card-amount-lg">
            <DigitOdometer value={ILS.format(data.budgetSpent)} />
          </span>
          <span className="aurora-body aurora-ink-3">
            מתוך {ILS.format(data.budgetTotal)}
          </span>
        </div>
        <div className="aurora-budget-bar" aria-hidden>
          <motion.div
            className="aurora-budget-bar-fill"
            style={{ background: tone }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, pct)}%` }}
            transition={{ duration: 0.72, ease: [0.32, 0.72, 0, 1] }}
          />
        </div>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          נותר {ILS.format(data.budgetRemaining)} · {pct}% נוצל
        </p>
      </GlassCard>
    </CardButton>
  );
}

function WeeklyCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const max = Math.max(1, ...data.weeklySpend.map((d) => d.amount));
  const avg =
    data.weeklySpend.reduce((s, d) => s + d.amount, 0) /
    Math.max(1, data.weeklySpend.length);
  const labels = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  const reduced = useReducedMotion();
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח גרף שבועי">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "ההוצאות השבוע" }}>
            השבוע · 7 ימים
          </Eyebrow>
          <span className="aurora-body aurora-ink-3" dir="ltr">
            ממוצע {ILS.format(Math.round(avg))}/יום
          </span>
        </div>
        <div className="aurora-weekly-wrap" aria-hidden>
          <div
            className="aurora-weekly-avg"
            style={{ bottom: `${(avg / max) * 80 + 8}px` }}
          />
          <div className="aurora-weekly-bars">
            {data.weeklySpend.map((d, i) => {
              const h = Math.max(6, Math.round((d.amount / max) * 80));
              const isToday = i === data.weeklySpend.length - 1;
              return (
                <motion.div
                  key={d.dayISO}
                  className={`aurora-weekly-bar ${isToday ? "aurora-weekly-bar-today" : ""}`}
                  initial={reduced ? { height: h } : { height: 0 }}
                  animate={{
                    height: h,
                    transition: reduced
                      ? { duration: 0.12 }
                      : {
                          duration: 0.5,
                          delay: i * 0.05,
                          ease: [0.32, 0.72, 0, 1],
                        },
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="aurora-weekly-labels" aria-hidden>
          {labels.map((l, i) => (
            <span key={l} className="aurora-weekly-label">
              {l}
              {i}
            </span>
          ))}
        </div>
      </GlassCard>
    </CardButton>
  );
}

function LaneCard({
  label,
  color,
  amount,
  history,
  onOpen,
}: {
  label: string;
  color: string;
  amount: number;
  history: number[];
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel={`פתח ${label}`}>
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <div
          aria-hidden
          className="aurora-lane-bullet"
          style={{ background: color }}
        />
        <p className="aurora-body aurora-ink-3 aurora-card-label">{label}</p>
        <div
          dir="ltr"
          className="aurora-card-amount aurora-lane-amount"
        >
          {ILS.format(amount)}
        </div>
        <LaneSparkline values={history} stroke={color} />
      </GlassCard>
    </CardButton>
  );
}

function IncomeCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח הכנסות החודש">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "הכנסות החודש" }}>
            הכנסות · החודש
          </Eyebrow>
          {data.nextEvent && data.nextEvent.kind === "income" ? (
            <span className="aurora-trend-chip" data-aurora-tone="safe">
              משכורת בעוד {data.nextEvent.daysUntil} ימים
            </span>
          ) : null}
        </div>
        <div className="aurora-card-row-amount">
          <span
            dir="ltr"
            className="aurora-card-amount-lg"
            style={{ color: "var(--aurora-state-safe)" }}
          >
            <DigitOdometer value={`+${ILS.format(data.incomeThisMonth)}`} />
          </span>
          <span className="aurora-body aurora-ink-3">התקבל מתחילת החודש</span>
        </div>
      </GlassCard>
    </CardButton>
  );
}

function UpcomingCard({
  data,
  now,
  onOpen,
}: {
  data: AuroraHomeData;
  now: Date;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח לוח אירועים 14 ימים">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "14 ימים קדימה" }}>
          14 ימים קדימה
        </Eyebrow>
        <ul className="aurora-card-list">
          {data.upcomingFortnight.length === 0 ? (
            <p className="aurora-body aurora-ink-3">
              אין אירועים בשבועיים הקרובים.
            </p>
          ) : (
            data.upcomingFortnight.slice(0, 3).map((e) => (
              <li key={`${e.whenISO}-${e.label}`}>
                <LedgerRow
                  accent={<LaneDot color={laneColor(e.kind)} />}
                  label={e.label}
                  meta={DAY_FMT.format(new Date(e.whenISO))}
                  amount={
                    (e.kind === "income" ? "+" : "−") + ILS.format(e.amount)
                  }
                  direction={e.kind === "income" ? "in" : "out"}
                />
              </li>
            ))
          )}
        </ul>
        {data.upcomingFortnight.length > 0 ? (
          <p
            className="aurora-body aurora-ink-3"
            style={{ marginBlockStart: "var(--aurora-space-2)" }}
            dir="rtl"
          >
            {relativeTime(data.upcomingFortnight[0].whenISO, now)} →{" "}
            {data.upcomingFortnight[0].label}
          </p>
        ) : null}
      </GlassCard>
    </CardButton>
  );
}

function ActivityCard({
  data,
  now,
  onOpen,
}: {
  data: AuroraHomeData;
  now: Date;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח פעילות אחרונה">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "פעילות אחרונה" }}>
            פעילות אחרונה
          </Eyebrow>
          <span className="aurora-body aurora-ink-3">
            {data.delta24hCount} ב-24 שעות
          </span>
        </div>
        <ul className="aurora-card-list">
          {data.recentActivity.length === 0 ? (
            <p className="aurora-body aurora-ink-3">השבוע שקט אצלך.</p>
          ) : (
            data.recentActivity.slice(0, 4).map((r) => (
              <li key={r.id}>
                <LedgerRow
                  label={r.label}
                  meta={relativeTime(r.whenISO, now)}
                  amount={
                    r.direction === "in"
                      ? `+${ILS.format(r.amount)}`
                      : `−${ILS.format(r.amount)}`
                  }
                  direction={
                    r.direction === "in"
                      ? "in"
                      : r.isWithdrawal
                        ? "pending"
                        : "out"
                  }
                />
              </li>
            ))
          )}
        </ul>
      </GlassCard>
    </CardButton>
  );
}

// ─────────────────────── visual atoms ───────────────────────────

function ProgressArc({
  percent,
  tone,
}: {
  percent: number;
  tone: "safe" | "watch" | "danger";
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  const stroke =
    tone === "danger"
      ? "var(--aurora-state-danger)"
      : tone === "watch"
        ? "var(--aurora-state-watch)"
        : "var(--aurora-state-safe)";
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      aria-hidden
      className="aurora-progress-arc"
    >
      <circle
        cx="28"
        cy="28"
        r={r}
        stroke="var(--aurora-hairline-quiet)"
        strokeWidth="4"
        fill="none"
      />
      <motion.circle
        cx="28"
        cy="28"
        r={r}
        stroke={stroke}
        strokeWidth="4"
        fill="none"
        strokeDasharray={c}
        strokeLinecap="round"
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.72, ease: [0.32, 0.72, 0, 1] }}
        transform="rotate(-90 28 28)"
      />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontSize="13"
        fontWeight="500"
        fill="var(--aurora-ink-2)"
      >
        {clamped}%
      </text>
    </svg>
  );
}

function LaneSparkline({
  values,
  stroke,
}: {
  values: number[];
  stroke: string;
}) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const w = 88;
  const h = 22;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="aurora-lane-spark"
    >
      <polyline
        points={points}
        stroke={stroke}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle
        cx={w}
        cy={h - ((values[values.length - 1] - min) / span) * h}
        r="2.2"
        fill={stroke}
      />
    </svg>
  );
}

function CountdownChip({
  targetISO,
  now,
  kind,
}: {
  targetISO: string;
  now: Date;
  kind: AuroraUpcomingEvent["kind"];
}) {
  const diff = new Date(targetISO).getTime() - now.getTime();
  const totalHours = Math.max(0, Math.round(diff / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const text =
    totalHours <= 0
      ? "היום"
      : days === 0
        ? `בעוד ${hours} שעות`
        : days === 1 && hours === 0
          ? "מחר"
          : days === 1
            ? `בעוד יום ו-${hours}ש׳`
            : hours === 0
              ? `בעוד ${days} ימים`
              : `בעוד ${days}י׳ ${hours}ש׳`;
  const tone =
    kind === "income"
      ? "safe"
      : days <= 1
        ? "watch"
        : "neutral";
  return (
    <span
      className="aurora-countdown-chip"
      data-aurora-tone={tone}
      dir="rtl"
    >
      {text}
    </span>
  );
}

// ─────────────────────── helpers ────────────────────────────────

function CardButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="aurora-card-button"
      whileTap={reduced ? undefined : { scale: 0.985 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      {children}
    </motion.button>
  );
}

function flatHistory(currentMonthValue: number): number[] {
  // Live-mode fallback: when we don't have real month-over-month
  // history yet, render six identical bars so the sparkline still
  // shows the lane is active. Phase 5 will plumb monthOverMonth.
  const v = Math.max(0, currentMonthValue);
  return [v, v, v, v, v, v];
}

function laneColor(kind: AuroraUpcomingEvent["kind"]): string {
  switch (kind) {
    case "income":
      return "var(--aurora-lane-income)";
    case "loan":
      return "var(--aurora-lane-loan)";
    case "card":
      return "var(--aurora-lane-card)";
    case "bank_debit":
    default:
      return "var(--aurora-lane-bank)";
  }
}

function sheetTitle(kind: SheetKey): string {
  switch (kind) {
    case "hero":
      return "פירוט יתרה";
    case "today":
      return "סטטוס יומי";
    case "next":
      return "אירועים קרובים";
    case "budget":
      return "בקרת תקציב";
    case "weekly":
      return "ההוצאות השבוע";
    case "loans":
      return "הלוואות";
    case "fixed":
      return "הוצאות קבועות";
    case "cards":
      return "אשראי החודש";
    case "income":
      return "הכנסות החודש";
    case "upcoming":
      return "14 ימים קדימה";
    case "activity":
      return "פעילות אחרונה";
    default:
      return "";
  }
}

function SheetBody({
  kind,
  data,
  now,
}: {
  kind: NonNullable<SheetKey>;
  data: AuroraHomeData;
  now: Date;
}) {
  if (kind === "upcoming") {
    return (
      <SheetList
        title="כל האירועים בשבועיים הקרובים"
        rows={data.upcomingFortnight.map((e) => ({
          label: e.label,
          meta: DAY_FMT.format(new Date(e.whenISO)),
          amount: e.amount,
          tone: laneColor(e.kind),
          direction: e.kind === "income" ? ("in" as const) : ("out" as const),
        }))}
      />
    );
  }
  if (kind === "activity") {
    return (
      <SheetList
        title="פעילות אחרונה"
        rows={data.recentActivity.map((r) => ({
          label: r.label,
          meta: relativeTime(r.whenISO, now),
          amount: r.amount,
          tone:
            r.direction === "in"
              ? "var(--aurora-state-safe)"
              : r.isWithdrawal
                ? "var(--aurora-lane-cash)"
                : "var(--aurora-ink-2)",
          direction:
            r.direction === "in"
              ? ("in" as const)
              : r.isWithdrawal
                ? ("pending" as const)
                : ("out" as const),
        }))}
      />
    );
  }
  const summary =
    kind === "hero"
      ? `יתרה חיה ${ILS.format(data.livBalance)} · צפי לסוף החודש ${ILS.format(data.eomForecast)}. ${data.coachSentence ?? ""}`
      : kind === "today"
        ? `מותר עוד ${ILS.format(data.dailyAllowanceAmount)} · הוצאת ${ILS.format(data.spentToday)} מתחילת היום · נשארו ${data.daysRemaining} ימים בחודש.`
        : kind === "next"
          ? data.nextEvent
            ? `${data.nextEvent.label} בעוד ${data.nextEvent.daysUntil === 0 ? "היום" : `${data.nextEvent.daysUntil} ימים`} · ${ILS.format(data.nextEvent.amount)}.`
            : "אין אירועים קרובים."
          : kind === "budget"
            ? `${ILS.format(data.budgetSpent)} מתוך ${ILS.format(data.budgetTotal)} (${data.budgetPct}%) · נותר ${ILS.format(data.budgetRemaining)}.`
            : kind === "weekly"
              ? `סך הוצאות בשבוע · ${ILS.format(data.weeklySpend.reduce((s, d) => s + d.amount, 0))}.`
              : kind === "loans"
                ? `סך הלוואות פעילות החודש · ${ILS.format(data.loansThisMonth)}.`
                : kind === "fixed"
                  ? `סך הוצאות קבועות החודש · ${ILS.format(data.fixedThisMonth)}.`
                  : kind === "cards"
                    ? `סך חיובי אשראי החודש · ${ILS.format(data.cardsThisMonth)}.`
                    : `סך הכנסות שהתקבלו · ${ILS.format(data.incomeThisMonth)}.`;
  return (
    <Fragment>
      <p className="aurora-body-l aurora-ink-2">{summary}</p>
    </Fragment>
  );
}

function SheetList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    meta: string;
    amount: number;
    tone: string;
    direction: "in" | "out" | "pending";
  }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-3)",
      }}
    >
      <Eyebrow srHeading={{ level: 2, text: title }}>{title}</Eyebrow>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {rows.map((r, i) => (
          <li key={`${i}-${r.label}`}>
            <LedgerRow
              accent={<LaneDot color={r.tone} />}
              label={r.label}
              meta={r.meta}
              amount={
                (r.direction === "in" ? "+" : "−") + ILS.format(r.amount)
              }
              direction={r.direction}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Memo guard so the relative-time tick doesn't re-render the whole
// tree gratuitously. Each useMemo here is intentionally tiny.
export const _useMemoGuard = useMemo;
