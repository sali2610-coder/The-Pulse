"use client";

// Phase 432 part 5 · AURORA v1 — AuroraHome (production · alive · polished)
//
// Compositional flow (top → bottom, each section distinct shape):
//   1. SignatureHero       — Cinema · live indicator · animated reveal
//                            month progress · EOM forecast · concierge
//   2. AIInsightsDeck      — 4-up rotating intelligence (praise/info/
//                            warn/suggest), each tappable → BottomSheet
//   3. ForecastCard        — 30-day cashflow line chart, animated draw
//   4. BudgetCard          — DigitOdometer + animated fill + trend chip
//   5. VelocityCard        — week vs last week % + HeatStrip
//   6. UpcomingTimeline    — horizontal 14-day strip + ledger preview
//   7. CategoryDonut       — top 5 categories · animated arcs · legend
//   8. RecentActivity      — relative-time ledger with delta chip
//   9. GoalsCard           — 2 goal arcs · countdown captions
//  10. SubsCard            — dormant subscriptions watch
//
// Every card tappable → BottomSheet. Every visual respects
// prefers-reduced-motion. Phase 1 tokens / Phase 2 shell /
// Phase 3 primitives / Phase 4 (live tick, demo data) all reused.

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
import { ConciergeSentence } from "@/components/aurora/aurora-concierge-sentence";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";
import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import {
  LaneDot,
  LedgerRow,
} from "@/components/aurora/aurora-ledger-row";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  Donut,
  HeatStrip,
  LineChart,
  MonthProgressBar,
} from "@/components/aurora/aurora-charts";
import { AuroraCategorySpendCard } from "@/components/aurora/aurora-category-spend-card";
import { PendingPulseCard } from "@/components/aurora/aurora-pending-center";
import {
  CardsByMonthCard,
  CheckpointRingCard,
  CommitmentsBreakdownCard,
} from "@/components/aurora/aurora-recovery-cards";
import { useAuroraRecovery } from "@/components/aurora/use-aurora-recovery";
import { DEMO_COACH_LINES } from "./aurora-demo-data";
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
  | "forecast"
  | "budget"
  | "velocity"
  | "upcoming"
  | "categories"
  | "activity"
  | "goals"
  | "subs"
  | "insight"
  | null;

// ── Hooks ────────────────────────────────────────────────────────
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function relativeTime(iso: string, now: Date): string {
  const target = new Date(iso);
  const diff = now.getTime() - target.getTime();
  if (diff < 0) {
    const m = Math.round(Math.abs(diff) / 60_000);
    if (m < 60) return `בעוד ${m} דק׳`;
    const h = Math.round(m / 60);
    if (h < 24) return `בעוד ${h} שעות`;
    const d = Math.round(h / 24);
    if (d === 1) return "מחר";
    return `בעוד ${d} ימים`;
  }
  const m = Math.round(diff / 60_000);
  if (m < 1) return "ממש עכשיו";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) {
    if (now.toDateString() === target.toDateString()) {
      return `היום · ${TIME_FMT.format(target)}`;
    }
    return `לפני ${h} שעות`;
  }
  const d = Math.round(h / 24);
  if (d === 1) return `אתמול · ${TIME_FMT.format(target)}`;
  if (d < 7) return `לפני ${d} ימים`;
  return DAY_FMT.format(target);
}

// Stagger atoms ────────────────────────────────────────────────────
const STAGGER = 0.06;
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
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={
        reduced
          ? { opacity: 1, transition: { duration: 0.12 } }
          : {
              opacity: 1,
              y: 0,
              transition: {
                duration: 0.46,
                delay: index * STAGGER,
                ease: [0.32, 0.72, 0, 1],
              },
            }
      }
    >
      {children}
    </motion.div>
  );
}

// ── Pick rotating CFO sentence ────────────────────────────────────
function pickCoach(coach: string | null, now: Date): string | null {
  if (!coach) return null;
  if (!DEMO_COACH_LINES.includes(coach)) return coach;
  const minute = now.getHours() * 60 + now.getMinutes();
  return DEMO_COACH_LINES[minute % DEMO_COACH_LINES.length];
}

// ──────────────────────────────────────────────────────────────────
//                     MAIN COMPOSITION
// ──────────────────────────────────────────────────────────────────

export function AuroraHome() {
  const data = useAuroraHome();
  const recovery = useAuroraRecovery();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [activeInsight, setActiveInsight] = useState(0);

  const insights = data.insights;
  const insight = insights[activeInsight] ?? insights[0];
  const coach = pickCoach(data.coachSentence, now);
  const hasRecovery =
    recovery.ready && !recovery.isDemo && recovery.checkpoints.length > 0;

  return (
    <div className="aurora-home-stack">
      <h1 className="sr-only">מסך הבית של Pulse</h1>

      <MountReveal index={0}>
        <PendingPulseCard />
      </MountReveal>

      <MountReveal index={0}>
        <SignatureHero
          data={data}
          coach={coach}
          onOpen={() => setSheet("hero")}
        />
      </MountReveal>

      {insights.length > 0 ? (
        <MountReveal index={1}>
          <AIInsightsDeck
            insights={insights}
            active={activeInsight}
            onPick={setActiveInsight}
            onOpen={() => setSheet("insight")}
          />
        </MountReveal>
      ) : null}

      <BentoGrid gap="comfortable">
        {hasRecovery ? (
          <BentoItem span={6}>
            <MountReveal index={2}>
              <CheckpointRingCard data={recovery} />
            </MountReveal>
          </BentoItem>
        ) : null}

        {hasRecovery ? (
          <BentoItem span={6}>
            <MountReveal index={3}>
              <CommitmentsBreakdownCard data={recovery} />
            </MountReveal>
          </BentoItem>
        ) : null}

        {hasRecovery ? (
          <BentoItem span={6}>
            <MountReveal index={4}>
              <CardsByMonthCard data={recovery} />
            </MountReveal>
          </BentoItem>
        ) : null}

        {hasRecovery ? (
          <BentoItem span={6}>
            <MountReveal index={5}>
              <AuroraCategorySpendCard />
            </MountReveal>
          </BentoItem>
        ) : null}

        <BentoItem span={6}>
          <MountReveal index={2}>
            <ForecastCard data={data} onOpen={() => setSheet("forecast")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={3}>
            <BudgetCard data={data} onOpen={() => setSheet("budget")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={3}>
          <MountReveal index={4}>
            <VelocityCard data={data} onOpen={() => setSheet("velocity")} />
          </MountReveal>
        </BentoItem>
        <BentoItem span={3}>
          <MountReveal index={5}>
            <SubsCard data={data} onOpen={() => setSheet("subs")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={6}>
            <UpcomingTimeline
              data={data}
              now={now}
              onOpen={() => setSheet("upcoming")}
            />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={7}>
            <CategoryDonut data={data} onOpen={() => setSheet("categories")} />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={8}>
            <RecentActivityCard
              data={data}
              now={now}
              onOpen={() => setSheet("activity")}
            />
          </MountReveal>
        </BentoItem>

        <BentoItem span={6}>
          <MountReveal index={9}>
            <GoalsCard data={data} onOpen={() => setSheet("goals")} />
          </MountReveal>
        </BentoItem>
      </BentoGrid>

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(o) => (o ? null : setSheet(null))}
        title={sheetTitle(sheet)}
      >
        {sheet ? (
          <SheetBody
            kind={sheet}
            data={data}
            now={now}
            insight={insight}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}

// ────────────────────────── SIGNATURE HERO ───────────────────────

function SignatureHero({
  data,
  coach,
  onOpen,
}: {
  data: AuroraHomeData;
  coach: string | null;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const totalDays = useMemo(() => {
    const [y, m] = (data.monthLabel.match(/\d+/g) ?? ["2026", "6"]).map(Number);
    return new Date(y, m, 0).getDate();
  }, [data.monthLabel]);
  const dayOfMonth = Math.max(1, totalDays - data.daysToEom);

  const eomTone =
    data.safetyState === "stress"
      ? "var(--aurora-state-danger)"
      : data.safetyState === "watch"
        ? "var(--aurora-state-watch)"
        : "var(--aurora-ink-1)";

  const markers: Array<{ day: number; label: string; tone?: "safe" | "watch" | "danger" }> = [];
  if (data.upcomingFortnight.length > 0) {
    for (const e of data.upcomingFortnight.slice(0, 3)) {
      const target = new Date(e.whenISO);
      if (target.getMonth() === new Date().getMonth()) {
        markers.push({
          day: target.getDate(),
          label: e.label,
          tone: e.kind === "income" ? "safe" : "watch",
        });
      }
    }
  }

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label="פתח פירוט יתרה"
      className="aurora-hero-signature"
      whileTap={reduced ? undefined : { scale: 0.992 }}
    >
      {/* Layered glass + aurora reflection layers */}
      <span aria-hidden className="aurora-hero-bg-1" />
      <span aria-hidden className="aurora-hero-bg-2" />
      <span aria-hidden className="aurora-hero-bg-3" />
      <span aria-hidden className="aurora-hero-scrim" />
      <span aria-hidden className="aurora-hero-gloss" />

      <div className="aurora-hero-content">
        <div className="aurora-hero-eyebrow-row">
          <div className="aurora-live-pill">
            <span aria-hidden className="aurora-live-dot" />
            <span className="aurora-live-label">LIVE · {data.monthLabel}</span>
          </div>
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

        <div className="aurora-hero-amount" dir="ltr">
          <DigitOdometer value={ILS.format(data.livBalance)} />
        </div>

        <div className="aurora-hero-caret-row">
          <BreathingCaret width={132} />
        </div>

        {data.delta24h > 0 ? (
          <div className="aurora-hero-delta">
            <span aria-hidden>↓</span>
            <span dir="ltr">{ILS.format(data.delta24h)}</span>
            <span>במעקב 24 שעות</span>
          </div>
        ) : null}

        <div className="aurora-hero-divider" aria-hidden />

        <div className="aurora-hero-eom-grid">
          <div>
            <Eyebrow srHeading={{ level: 3, text: "צפי לסוף החודש" }}>
              צפי לסוף החודש
            </Eyebrow>
            <span
              dir="ltr"
              className="aurora-hero-eom-amount"
              style={{ color: eomTone }}
            >
              <DigitOdometer value={ILS.format(data.eomForecast)} />
            </span>
            <span className="aurora-hero-eom-state" data-aurora-state={data.safetyState}>
              {data.safetyLabel}
              {data.eomBudget > 0 ? ` · יעד ${ILS.format(data.eomBudget)}` : ""}
            </span>
          </div>
          <div className="aurora-hero-progress">
            <MonthProgressBar
              dayOfMonth={dayOfMonth}
              totalDays={totalDays}
              markers={markers}
            />
          </div>
        </div>

        {coach ? (
          <div className="aurora-hero-coach">
            <ConciergeSentence variant="soft">{coach}</ConciergeSentence>
          </div>
        ) : null}
      </div>
    </motion.button>
  );
}

// ───────────────────────── AI INSIGHTS DECK ──────────────────────

const INSIGHT_TONE: Record<string, { color: string; bg: string; chip: string; label: string }> = {
  praise: {
    color: "var(--aurora-state-safe)",
    bg: "rgba(52, 211, 153, 0.08)",
    chip: "rgba(52, 211, 153, 0.16)",
    label: "ניצחון",
  },
  info: {
    color: "var(--aurora-state-info)",
    bg: "rgba(123, 169, 255, 0.08)",
    chip: "rgba(123, 169, 255, 0.16)",
    label: "מידע",
  },
  warn: {
    color: "var(--aurora-state-watch)",
    bg: "rgba(250, 204, 21, 0.10)",
    chip: "rgba(250, 204, 21, 0.18)",
    label: "שווה תשומת לב",
  },
  suggest: {
    color: "var(--aurora-accent-gold-loud)",
    bg: "rgba(212, 175, 55, 0.10)",
    chip: "rgba(212, 175, 55, 0.18)",
    label: "המלצה",
  },
};

function AIInsightsDeck({
  insights,
  active,
  onPick,
  onOpen,
}: {
  insights: AuroraHomeData["insights"];
  active: number;
  onPick: (i: number) => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const current = insights[active] ?? insights[0];
  const tone = INSIGHT_TONE[current.kind];
  return (
    <section className="aurora-ai-panel" aria-label="תובנות AI">
      <div className="aurora-ai-head">
        <Eyebrow srHeading={{ level: 2, text: "טייס פיננסי AI" }}>
          טייס פיננסי AI · {tone.label}
        </Eyebrow>
        <span className="aurora-ai-count" dir="ltr">
          {active + 1}/{insights.length}
        </span>
      </div>

      <motion.button
        type="button"
        onClick={onOpen}
        aria-label={`פתח תובנה: ${current.sentence}`}
        className="aurora-ai-card"
        style={{ background: tone.bg, borderColor: tone.color }}
        whileTap={reduced ? undefined : { scale: 0.99 }}
      >
        <span className="aurora-ai-edge" style={{ background: tone.color }} />
        <div className="aurora-ai-body">
          <p className="aurora-ai-sentence">{current.sentence}</p>
          {current.amount !== undefined ? (
            <span
              className="aurora-ai-amount"
              dir="ltr"
              style={{ color: tone.color }}
            >
              <DigitOdometer value={ILS.format(current.amount)} />
            </span>
          ) : null}
          {current.cta ? (
            <span
              className="aurora-ai-cta"
              style={{
                background: tone.chip,
                color: tone.color,
              }}
            >
              {current.cta} →
            </span>
          ) : null}
        </div>
      </motion.button>

      <div className="aurora-ai-dots" aria-hidden>
        {insights.map((ins, i) => (
          <button
            key={ins.key}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`עבור לתובנה ${i + 1}`}
            className="aurora-ai-dot"
            data-aurora-active={i === active ? "true" : "false"}
          />
        ))}
      </div>
    </section>
  );
}

// ───────────────────────── FORECAST CARD ──────────────────────────

function ForecastCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const values = data.cashflow30d.length > 0 ? data.cashflow30d : null;
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח חיזוי תזרים">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "חיזוי תזרים 30 ימים" }}>
            חיזוי תזרים · 30 ימים
          </Eyebrow>
          <span
            className="aurora-trend-chip"
            data-aurora-tone={data.safetyState === "stress" ? "danger" : "safe"}
          >
            {data.safetyLabel}
          </span>
        </div>
        <div className="aurora-card-row-amount">
          <span dir="ltr" className="aurora-card-amount-lg">
            <DigitOdometer value={ILS.format(data.eomForecast)} />
          </span>
          <span className="aurora-body aurora-ink-3">בסוף יוני</span>
        </div>
        {values ? (
          <div className="aurora-forecast-chart">
            <LineChart values={values} height={132} />
          </div>
        ) : (
          <EmptyHint text="הוסף יתרה כדי לראות תזרים 30 ימים." />
        )}
      </GlassCard>
    </CardButton>
  );
}

// ───────────────────────── BUDGET CARD ────────────────────────────

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
            בקרת תקציב · {data.monthLabel}
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

// ───────────────────────── VELOCITY CARD ──────────────────────────

function VelocityCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const v = data.velocity;
  const reallyImproving = v.pctVsLast < 0;
  const sign = v.pctVsLast >= 0 ? "↑" : "↓";
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח קצב הוצאות">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "קצב השבוע" }}>
          קצב · השבוע
        </Eyebrow>
        <div
          dir="ltr"
          className="aurora-card-amount"
          style={{
            color: reallyImproving
              ? "var(--aurora-state-safe)"
              : "var(--aurora-state-watch)",
          }}
        >
          {sign} {Math.abs(v.pctVsLast)}%
        </div>
        <p
          className="aurora-body aurora-ink-3"
          style={{ marginBlockStart: "var(--aurora-space-1)" }}
        >
          {reallyImproving ? "פחות משבוע שעבר" : "יותר משבוע שעבר"}
        </p>
        <HeatStrip
          values={data.weeklySpend.map((d) => d.amount)}
        />
      </GlassCard>
    </CardButton>
  );
}

// ───────────────────────── SUBS CARD ──────────────────────────────

function SubsCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const total = data.subscriptions.reduce((s, x) => s + x.amount, 0);
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח מנויים רדומים">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "מנויים רדומים" }}>
          מנויים רדומים
        </Eyebrow>
        {data.subscriptions.length === 0 ? (
          <EmptyHint text="הכל בשימוש. אין מנויים רדומים." />
        ) : (
          <>
            <div
              dir="ltr"
              className="aurora-card-amount"
              style={{ color: "var(--aurora-accent-gold-loud)" }}
            >
              {ILS.format(total)}/חודש
            </div>
            <p
              className="aurora-body aurora-ink-3"
              style={{ marginBlockStart: "var(--aurora-space-1)" }}
            >
              {data.subscriptions.length} מנויים בסיכון
            </p>
            <ul className="aurora-card-list">
              {data.subscriptions.slice(0, 2).map((s) => (
                <li key={s.key}>
                  <LedgerRow
                    accent={<LaneDot color="var(--aurora-accent-gold-loud)" />}
                    label={s.label}
                    meta={`לא בשימוש ${s.unusedDays} ימים`}
                    amount={`−${ILS.format(s.amount)}`}
                    direction="pending"
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </GlassCard>
    </CardButton>
  );
}

// ───────────────────── UPCOMING TIMELINE ──────────────────────────

function UpcomingTimeline({
  data,
  now,
  onOpen,
}: {
  data: AuroraHomeData;
  now: Date;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח 14 ימים קדימה">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <div className="aurora-card-row-top">
          <Eyebrow srHeading={{ level: 3, text: "14 ימים קדימה" }}>
            14 ימים קדימה
          </Eyebrow>
          {data.upcomingFortnight.length > 0 ? (
            <span className="aurora-body aurora-ink-3">
              {relativeTime(data.upcomingFortnight[0].whenISO, now)} ·{" "}
              {data.upcomingFortnight[0].label}
            </span>
          ) : null}
        </div>
        {data.upcomingFortnight.length === 0 ? (
          <EmptyHint text="אין אירועים מתוכננים בשבועיים הקרובים." />
        ) : (
          <>
            <UpcomingTimelineStrip
              events={data.upcomingFortnight}
              now={now}
            />
            <ul
              className="aurora-card-list"
              style={{ marginBlockStart: "var(--aurora-space-3)" }}
            >
              {data.upcomingFortnight.slice(0, 3).map((e) => (
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
              ))}
            </ul>
          </>
        )}
      </GlassCard>
    </CardButton>
  );
}

function UpcomingTimelineStrip({
  events,
  now,
}: {
  events: AuroraUpcomingEvent[];
  now: Date;
}) {
  const reduced = useReducedMotion();
  // Map each event to a [0,1] position along the 14-day range.
  const range = 14 * 86_400_000;
  const start = now.getTime();
  return (
    <div className="aurora-timeline-strip" aria-hidden>
      <div className="aurora-timeline-axis" />
      {events.map((e, i) => {
        const t = new Date(e.whenISO).getTime() - start;
        const left = Math.max(0, Math.min(100, (t / range) * 100));
        const c = laneColor(e.kind);
        return (
          <motion.span
            key={`${e.whenISO}-${i}`}
            className="aurora-timeline-event"
            style={{ insetInlineStart: `${left}%`, background: c }}
            initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduced ? 0.12 : 0.4,
              delay: reduced ? 0 : 0.1 + i * 0.06,
              ease: [0.32, 0.72, 0, 1],
            }}
            title={`${e.label} · ${DAY_FMT.format(new Date(e.whenISO))}`}
          />
        );
      })}
      <span className="aurora-timeline-now" style={{ insetInlineStart: 0 }}>
        עכשיו
      </span>
      <span className="aurora-timeline-end" style={{ insetInlineEnd: 0 }}>
        +14
      </span>
    </div>
  );
}

// ───────────────────────── CATEGORY DONUT ─────────────────────────

function CategoryDonut({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const total = data.topCategories.reduce((s, c) => s + c.amount, 0);
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח קטגוריות">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "קטגוריות מובילות" }}>
          לאן הולך הכסף · {data.monthLabel}
        </Eyebrow>
        {data.topCategories.length === 0 ? (
          <EmptyHint text="עוד אין הוצאות בקטגוריות. כל חיוב חדש יסווג אוטומטית." />
        ) : (
          <div className="aurora-donut-row">
            <Donut
              slices={data.topCategories.map((c) => ({
                label: c.label,
                amount: c.amount,
                color: c.color,
              }))}
              centerLabel={ILS.format(total)}
              centerSub="סה״כ החודש"
            />
            <ul className="aurora-cat-legend">
              {data.topCategories.map((c) => (
                <li key={c.key}>
                  <span
                    className="aurora-cat-dot"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <span className="aurora-cat-label">{c.label}</span>
                  <span dir="ltr" className="aurora-cat-amount">
                    {ILS.format(c.amount)}
                  </span>
                  <span
                    className="aurora-cat-delta"
                    data-aurora-tone={c.delta < 0 ? "safe" : "watch"}
                  >
                    {c.delta < 0 ? "↓" : "↑"} {Math.abs(c.delta)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassCard>
    </CardButton>
  );
}

// ───────────────────────── RECENT ACTIVITY ────────────────────────

function RecentActivityCard({
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
        {data.recentActivity.length === 0 ? (
          <EmptyHint text="השבוע שקט אצלך. הוסף הוצאה כדי לראות אותה כאן." />
        ) : (
          <ul className="aurora-card-list">
            {data.recentActivity.slice(0, 4).map((r) => (
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
            ))}
          </ul>
        )}
      </GlassCard>
    </CardButton>
  );
}

// ───────────────────────── GOALS CARD ─────────────────────────────

function GoalsCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח יעדים">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "יעדים" }}>
          יעדים פעילים
        </Eyebrow>
        {data.goals.length === 0 ? (
          <EmptyHint text="הוסף יעד חיסכון ראשון — Pulse יבנה לך מסלול אוטומטית." />
        ) : (
          <div className="aurora-goals-row">
            {data.goals.map((g) => (
              <div key={g.key} className="aurora-goal-cell">
                <ProgressRing pct={g.pct} tone={g.tone} />
                <p className="aurora-body aurora-ink-1 aurora-goal-label">
                  {g.label}
                </p>
                <p className="aurora-body aurora-ink-3">
                  {ILS.format(g.amount)} / {ILS.format(g.target)}
                </p>
                <p className="aurora-body aurora-ink-3">{g.dueLabel}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </CardButton>
  );
}

function ProgressRing({
  pct,
  tone,
}: {
  pct: number;
  tone: "safe" | "watch" | "stress";
}) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  const stroke =
    tone === "stress"
      ? "var(--aurora-state-danger)"
      : tone === "watch"
        ? "var(--aurora-state-watch)"
        : "var(--aurora-state-safe)";
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      aria-hidden
      className="aurora-progress-ring"
    >
      <circle
        cx="40"
        cy="40"
        r={r}
        stroke="var(--aurora-hairline-quiet)"
        strokeWidth="6"
        fill="none"
      />
      <motion.circle
        cx="40"
        cy="40"
        r={r}
        stroke={stroke}
        strokeWidth="6"
        fill="none"
        strokeDasharray={c}
        strokeLinecap="round"
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
        transform="rotate(-90 40 40)"
      />
      <text
        x="40"
        y="46"
        textAnchor="middle"
        fontSize="16"
        fontWeight="400"
        fill="var(--aurora-ink-1)"
      >
        {clamped}%
      </text>
    </svg>
  );
}

// ─────────────────────────── helpers ──────────────────────────────

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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="aurora-empty-hint">
      <span aria-hidden className="aurora-empty-glyph" />
      <p className="aurora-body aurora-ink-2">{text}</p>
    </div>
  );
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
    case "forecast":
      return "חיזוי 30 ימים";
    case "budget":
      return "בקרת תקציב";
    case "velocity":
      return "קצב השבוע";
    case "upcoming":
      return "14 ימים קדימה";
    case "categories":
      return "קטגוריות מובילות";
    case "activity":
      return "פעילות אחרונה";
    case "goals":
      return "יעדים";
    case "subs":
      return "מנויים רדומים";
    case "insight":
      return "תובנת AI";
    default:
      return "";
  }
}

function SheetBody({
  kind,
  data,
  now,
  insight,
}: {
  kind: NonNullable<SheetKey>;
  data: AuroraHomeData;
  now: Date;
  insight: AuroraHomeData["insights"][number] | undefined;
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
  if (kind === "subs") {
    return (
      <SheetList
        title="מנויים שלא בשימוש"
        rows={data.subscriptions.map((s) => ({
          label: s.label,
          meta: `${s.unusedDays} ימים`,
          amount: s.amount,
          tone: "var(--aurora-accent-gold-loud)",
          direction: "pending" as const,
        }))}
      />
    );
  }
  if (kind === "categories") {
    const total = data.topCategories.reduce((s, c) => s + c.amount, 0);
    return (
      <Fragment>
        <p className="aurora-body-l aurora-ink-2">
          סך הוצאות החודש לפי קטגוריה · {ILS.format(total)}.
        </p>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {data.topCategories.map((c) => (
            <li key={c.key}>
              <LedgerRow
                accent={<LaneDot color={c.color} />}
                label={c.label}
                meta={`${c.delta < 0 ? "↓" : "↑"} ${Math.abs(c.delta)}% מהממוצע`}
                amount={`−${ILS.format(c.amount)}`}
                direction="out"
              />
            </li>
          ))}
        </ul>
      </Fragment>
    );
  }
  if (kind === "goals") {
    return (
      <Fragment>
        <p className="aurora-body-l aurora-ink-2">
          יעדים פעילים · התקדמות חודשית מתעדכנת אוטומטית.
        </p>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {data.goals.map((g) => (
            <li key={g.key}>
              <LedgerRow
                accent={<LaneDot color="var(--aurora-state-safe)" />}
                label={g.label}
                meta={g.dueLabel}
                amount={`${g.pct}%`}
                direction="in"
              />
            </li>
          ))}
        </ul>
      </Fragment>
    );
  }
  if (kind === "insight" && insight) {
    return (
      <Fragment>
        <p className="aurora-body-l aurora-ink-2">{insight.sentence}</p>
        {insight.amount !== undefined ? (
          <p className="aurora-body aurora-ink-3">
            סכום במוקד: {ILS.format(insight.amount)}
          </p>
        ) : null}
        {insight.cta ? (
          <button type="button" className="aurora-ghost-button">
            {insight.cta} →
          </button>
        ) : null}
      </Fragment>
    );
  }
  // Single-paragraph defaults for the remaining hero / forecast / budget /
  // velocity sheets — Phase 5 will replace these with full drill-downs.
  const summary =
    kind === "hero"
      ? `יתרה חיה ${ILS.format(data.livBalance)} · צפי לסוף החודש ${ILS.format(data.eomForecast)}. ${data.coachSentence ?? ""}`
      : kind === "forecast"
        ? `התזרים הצפוי לסוף החודש · ${ILS.format(data.eomForecast)} · נשארו ${data.daysToEom} ימים.`
        : kind === "budget"
          ? `${ILS.format(data.budgetSpent)} מתוך ${ILS.format(data.budgetTotal)} (${data.budgetPct}%) · נותר ${ILS.format(data.budgetRemaining)}.`
          : `קצב השבוע · ${data.velocity.pctVsLast >= 0 ? "+" : "−"}${Math.abs(data.velocity.pctVsLast)}% מהשבוע הקודם.`;
  return <p className="aurora-body-l aurora-ink-2">{summary}</p>;
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
