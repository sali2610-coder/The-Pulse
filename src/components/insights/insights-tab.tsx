"use client";

// Insights · Financial Intelligence Center v2.
//
// Complete rebuild of the tab as a single-screen cockpit dashboard.
// Every value comes from existing engines (gatherAiInsights,
// detectSpendAnomalies, liquidityCurve, forecastEndOfMonth,
// categoryTrends, monthOverMonthTotals). No engine, calculation,
// forecast, store, API, or model change — only UI/UX composition.
//
// Screen composition:
//   1. Hero CFO card (~280px)
//        greeting · Financial Health Score ring · AI 3-line summary
//        · 30-day balance sparkline
//   2. 5 KPI chips that swap the summary lens inside the hero
//   3. 2×3 dashboard grid (6 tap-cards): risks / opportunities /
//      forecast / week / AI recs / trends
//   4. Inline expansion under the grid — only one card open at a
//      time, spring animation
//   5. Timeline of live events
//   6. AI Recommendations carousel with apply / dismiss
//   7. Trends mini graphs
//   8. Smart footer "What Changed Today"
//
// Bottom-most: the CFO Sandbox stays as the AI simulation surface.

import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Lightbulb,
  LineChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { tap as hapticTap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { addMonths, currentMonthKey } from "@/lib/dates";
import { CfoSandboxCard } from "@/components/insights/cfo-sandbox-card";
import { gatherAiInsights, type AiInsight } from "@/lib/ai-insights";
import {
  markResolved,
  statusOf,
  subscribe as subscribeStatus,
  type InsightStatusKind,
} from "@/lib/insight-status";
import { detectSpendAnomalies, type SpendAnomaly } from "@/lib/spend-anomalies";
import { liquidityCurve, type LiquidityCurve } from "@/lib/liquidity-curve";
import {
  forecastEndOfMonth,
  categoryTrends,
  monthOverMonthTotals,
} from "@/lib/forecast";
import { getCategory, type CategoryId } from "@/lib/categories";
import { buildLiveEvents, formatRelative } from "@/lib/live-events";
import type { Loan, RecurringRule } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});
const EASE = [0.32, 0.72, 0, 1] as const;

type Chip = "risk" | "cash" | "savings" | "forecast" | "ai";
type Lens =
  | "risks"
  | "opportunities"
  | "forecast"
  | "week"
  | "recs"
  | "trends"
  | null;

function useStatusTick(): number {
  return useSyncExternalStore(
    (cb) => subscribeStatus(cb),
    () => 0,
    () => 0,
  );
}
function useNowTick(intervalMs: number): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, intervalMs);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0,
  );
}

// ── Root ──────────────────────────────────────────────────

export function InsightsTab() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  useStatusTick();
  const now = useNowTick(60_000);

  const [chip, setChip] = useState<Chip>("risk");
  const [lens, setLens] = useState<Lens>(null);

  const curve = useMemo<LiquidityCurve | null>(() => {
    if (!hydrated) return null;
    return liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays: 30,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  const ai = useMemo(() => {
    if (!hydrated) return null;
    return gatherAiInsights({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    monthlyBudget,
  ]);

  const eomForecast = useMemo(() => {
    if (!hydrated) return null;
    return forecastEndOfMonth({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  const anomalies = useMemo<SpendAnomaly[]>(() => {
    if (!hydrated) return [];
    return detectSpendAnomalies({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  const week = useMemo(() => collectUpcomingWeek(rules, loans, now), [
    rules,
    loans,
    now,
  ]);

  const trends = useMemo(() => {
    if (!hydrated) return [];
    return categoryTrends({ entries, monthKey: currentMonthKey() }).slice(0, 6);
  }, [hydrated, entries]);

  const mom = useMemo(() => {
    if (!hydrated) return [];
    return monthOverMonthTotals({ entries, monthKey: currentMonthKey() }).slice(-6);
  }, [hydrated, entries]);

  const liveEvents = useMemo(
    () =>
      buildLiveEvents({
        entries,
        rules,
        incomes,
        now: new Date(now || 0),
        cap: 6,
      }),
    [entries, rules, incomes, now],
  );

  if (!hydrated || !ai) return null;

  const insights = ai.insights;
  const risks = insights.filter((i) => i.group === "risk");
  const opportunities = insights.filter((i) => i.group === "opportunity");
  const recs = insights.filter(
    (i) =>
      i.group === "recommendation" ||
      i.group === "trend" ||
      i.group === "prediction" ||
      i.group === "positive",
  );

  const savings = sumOpportunityImpact(opportunities);
  // Single source of truth for the EOM balance across Home / Time /
  // Insights: the liquidity-curve point closest to the last day of
  // the current month. Home reads the same value via
  // `pickCurvePointForDate` in use-home-data.ts. The bucket-summed
  // formula in `forecastEndOfMonth` is kept only for the breakdown
  // rows inside ForecastLens (anchors / income / fixed / loans /
  // slices); the headline number always uses the curve so users see
  // the same "צפוי סוף חודש" everywhere.
  const eomBalance =
    pickEomFromCurve(curve) ?? eomForecast?.forecast ?? 0;

  const score = computeHealthScore(risks, opportunities, insights.length);
  const scoreStatus =
    score >= 80
      ? { label: "מצוין", tone: "safe" as const }
      : score >= 55
        ? { label: "כדאי לבדוק", tone: "watch" as const }
        : { label: "דורש התייחסות", tone: "danger" as const };

  const summaryLines = composeSummaryLines(chip, now, {
    eomForecast,
    eomBalance,
    risks,
    opportunities,
    anomalies,
    week,
    savings,
  });

  function toggleLens(next: Lens) {
    hapticTap();
    setLens((prev) => (prev === next ? null : next));
  }
  function pickChip(next: Chip) {
    hapticTap();
    setChip(next);
  }

  return (
    <div className="fic-root pulse-stagger" dir="rtl">
      <HeroCfo
        score={score}
        status={scoreStatus}
        summaryLines={summaryLines}
        curve={curve}
        greeting={greetingFor(new Date(now))}
      />

      <ChipRow chip={chip} onPick={pickChip} />

      <div className="fic-grid" data-lens-open={lens ?? undefined}>
        <FicCard
          icon={<AlertTriangle className="size-4" />}
          eyebrow="סיכונים"
          headline={String(risks.length)}
          hint={anomalies.length > 0 ? `+${anomalies.length} חריגות` : "0 חריגות"}
          tone="danger"
          active={lens === "risks"}
          dimmed={lens !== null && lens !== "risks"}
          onClick={() => toggleLens("risks")}
        />
        <FicCard
          icon={<Lightbulb className="size-4" />}
          eyebrow="הזדמנויות"
          headline={savings > 0 ? ILS.format(Math.round(savings)) : "—"}
          hint={
            opportunities.length > 0
              ? `${opportunities.length} רעיונות`
              : "אין"
          }
          tone="watch"
          active={lens === "opportunities"}
          dimmed={lens !== null && lens !== "opportunities"}
          onClick={() => toggleLens("opportunities")}
        />
        <FicCard
          icon={<Wallet className="size-4" />}
          eyebrow="תחזית סוף חודש"
          headline={ILS.format(Math.round(eomBalance))}
          hint={eomBalance < 0 ? "בגרעון" : "יציב"}
          tone={eomBalance < 0 ? "danger" : "safe"}
          active={lens === "forecast"}
          dimmed={lens !== null && lens !== "forecast"}
          onClick={() => toggleLens("forecast")}
        />
        <FicCard
          icon={<CalendarClock className="size-4" />}
          eyebrow="השבוע הקרוב"
          headline={String(week.length)}
          hint={
            week.length > 0
              ? `${ILS.format(Math.round(sumWeek(week)))} סה״כ`
              : "אין חיובים"
          }
          tone="cyan"
          active={lens === "week"}
          dimmed={lens !== null && lens !== "week"}
          onClick={() => toggleLens("week")}
        />
        <FicCard
          icon={<Bot className="size-4" />}
          eyebrow="המלצות AI"
          headline={String(recs.length)}
          hint={recs.length > 0 ? "לפתיחה" : "אין"}
          tone="gold"
          active={lens === "recs"}
          dimmed={lens !== null && lens !== "recs"}
          onClick={() => toggleLens("recs")}
        />
        <FicCard
          icon={<LineChart className="size-4" />}
          eyebrow="מגמות"
          headline={trends.length > 0 ? `${trends.length}` : "—"}
          hint={mom.length > 0 ? `${mom.length} חודשים` : "אין"}
          tone="purple"
          active={lens === "trends"}
          dimmed={lens !== null && lens !== "trends"}
          onClick={() => toggleLens("trends")}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {lens === "risks" ? (
          <InsightLens
            key="risks"
            eyebrow="סיכונים"
            rows={risks}
            now={now}
            tone="danger"
          />
        ) : null}
        {lens === "opportunities" ? (
          <InsightLens
            key="opportunities"
            eyebrow="הזדמנויות לחיסכון"
            rows={opportunities}
            now={now}
            tone="watch"
          />
        ) : null}
        {lens === "forecast" ? (
          <ForecastLens
            key="forecast"
            eom={eomForecast}
            eomBalance={eomBalance}
            curve={curve}
          />
        ) : null}
        {lens === "week" ? <WeekLens key="week" rows={week} /> : null}
        {lens === "recs" ? (
          <RecsCarousel key="recs" rows={recs} now={now} />
        ) : null}
        {lens === "trends" ? (
          <TrendsLens key="trends" trends={trends} mom={mom} />
        ) : null}
      </AnimatePresence>

      <TimelineSection events={liveEvents} now={now} />

      <SmartFooter events={liveEvents} now={now} />

      <CfoSandboxCard />
    </div>
  );
}

// ── Hero CFO ──────────────────────────────────────────────

function HeroCfo({
  score,
  status,
  summaryLines,
  curve,
  greeting,
}: {
  score: number;
  status: { label: string; tone: "safe" | "watch" | "danger" };
  summaryLines: Array<{ icon: string; text: string }>;
  curve: LiquidityCurve | null;
  greeting: string;
}) {
  const reduced = useReducedMotion();
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  const ratio = Math.max(0, Math.min(1, score / 100));

  return (
    <section className="fic-hero" data-tone={status.tone} aria-label="מרכז בקרה AI">
      <span aria-hidden className="fic-hero-aurora" />
      <div className="fic-hero-topline">
        <span className="fic-hero-cfo">CFO BRAIN</span>
        <span className="fic-hero-greeting">{greeting}</span>
      </div>
      <div className="fic-hero-body">
        <div className="fic-hero-ring">
          <svg viewBox="0 0 160 160" width="100%" height="100%">
            <defs>
              <linearGradient id="fic-hero-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.7" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
              </linearGradient>
            </defs>
            <circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="11"
            />
            <motion.circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke="url(#fic-hero-grad)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              transform="rotate(-90 80 80)"
              initial={reduced ? undefined : { strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: CIRC * (1 - ratio) }}
              transition={{ duration: reduced ? 0.12 : 1.1, ease: EASE }}
            />
          </svg>
          <div className="fic-hero-ring-center">
            <span className="fic-hero-score" data-mono="true" dir="ltr">
              {score}
            </span>
            <span className="fic-hero-of">/100</span>
            <span className="fic-hero-status">{status.label}</span>
          </div>
        </div>
        <div className="fic-hero-summary">
          {summaryLines.map((ln, i) => (
            <motion.div
              key={ln.text + i}
              className="fic-hero-summary-line"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.06, 0.18),
                duration: reduced ? 0.12 : 0.32,
                ease: EASE,
              }}
            >
              <span className="fic-hero-summary-icon" aria-hidden>
                {ln.icon}
              </span>
              <span>{ln.text}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="fic-hero-spark">
        <Sparkline curve={curve} tone={status.tone} />
      </div>
    </section>
  );
}

function Sparkline({
  curve,
  tone,
}: {
  curve: LiquidityCurve | null;
  tone: "safe" | "watch" | "danger";
}) {
  const reduced = useReducedMotion();
  const shape = useMemo(() => {
    if (!curve || curve.points.length === 0) return null;
    const pts = curve.points;
    const max = Math.max(...pts.map((p) => p.balance));
    const min = Math.min(...pts.map((p) => p.balance));
    const range = max - min || 1;
    const W = 300;
    const H = 60;
    const x = (i: number) => (i / (pts.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / range) * H;
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(" ");
    const area = `${path} L${W},${H} L0,${H} Z`;
    return { path, area, W, H, min, max };
  }, [curve]);
  if (!shape) return null;
  return (
    <svg
      viewBox={`0 0 ${shape.W} ${shape.H}`}
      preserveAspectRatio="none"
      className="fic-hero-spark-svg"
      data-tone={tone}
      aria-hidden
    >
      <defs>
        <linearGradient id="fic-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={shape.area}
        fill="url(#fic-spark-fill)"
        initial={reduced ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      />
      <motion.path
        d={shape.path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? undefined : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0.12 : 1.0, ease: EASE }}
      />
    </svg>
  );
}

// ── Chip row ──────────────────────────────────────────────

const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: "risk", label: "Risk" },
  { key: "cash", label: "Cash" },
  { key: "savings", label: "Savings" },
  { key: "forecast", label: "Forecast" },
  { key: "ai", label: "AI" },
];

function ChipRow({
  chip,
  onPick,
}: {
  chip: Chip;
  onPick: (c: Chip) => void;
}) {
  return (
    <div className="fic-chips" role="tablist" aria-label="בחר מבט">
      {CHIPS.map((c) => {
        const active = chip === c.key;
        return (
          <motion.button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            className="fic-chip"
            data-active={active ? "true" : undefined}
            onClick={() => onPick(c.key)}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {c.label}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── 6-tile grid ───────────────────────────────────────────

function FicCard({
  icon,
  eyebrow,
  headline,
  hint,
  tone,
  active,
  dimmed,
  onClick,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  headline: string;
  hint: string;
  tone: "danger" | "watch" | "safe" | "cyan" | "purple" | "gold";
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="fic-card"
      data-tone={tone}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${eyebrow} · ${headline}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="fic-card-halo" />
      <span aria-hidden className="fic-card-glyph">
        {icon}
      </span>
      <span className="fic-card-eyebrow">{eyebrow}</span>
      <span className="fic-card-headline" data-mono="true" dir="ltr">
        {headline}
      </span>
      <span className="fic-card-hint">{hint}</span>
    </motion.button>
  );
}

// ── Lens frame ────────────────────────────────────────────

function LensFrame({
  eyebrow,
  right,
  children,
}: {
  eyebrow: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="fic-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
        duration: reduced ? 0.12 : undefined,
      }}
    >
      <header className="fic-lens-head">
        <span className="fic-lens-eyebrow">{eyebrow}</span>
        {right}
      </header>
      {children}
    </motion.section>
  );
}

function InsightLens({
  eyebrow,
  rows,
  now,
  tone,
}: {
  eyebrow: string;
  rows: AiInsight[];
  now: number;
  tone: "danger" | "watch" | "gold";
}) {
  const visible = rows.slice(0, 6);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow={eyebrow}>
        <div className="fic-clean">אין פריטים בקטגוריה הזו.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow={eyebrow}>
      <ul className="fic-rows">
        {visible.map((ins) => (
          <InsightRow key={ins.id} ins={ins} now={now} tone={tone} />
        ))}
      </ul>
      {more > 0 ? <div className="fic-more">+ עוד {more}</div> : null}
    </LensFrame>
  );
}

function InsightRow({
  ins,
  now,
  tone,
}: {
  ins: AiInsight;
  now: number;
  tone: "danger" | "watch" | "gold";
}) {
  const status: InsightStatusKind = statusOf(ins.id, now);
  const resolved = status === "resolved";
  return (
    <li
      className="fic-row"
      data-tone={tone}
      data-resolved={resolved ? "true" : undefined}
    >
      <span aria-hidden className="fic-row-rail" />
      <div className="fic-row-body">
        <span className="fic-row-title">{ins.title}</span>
        <span className="fic-row-meta">{ins.body}</span>
        {ins.action ? (
          <span className="fic-row-action">💡 {ins.action}</span>
        ) : null}
      </div>
      {!resolved ? (
        <button
          type="button"
          className="fic-row-cta"
          onClick={() => {
            hapticTap();
            markResolved(ins.id);
          }}
          aria-label="סמן כטופל"
        >
          סמן כטופל
        </button>
      ) : (
        <span aria-hidden className="fic-row-cue">✓</span>
      )}
    </li>
  );
}

function ForecastLens({
  eom,
  eomBalance,
  curve,
}: {
  eom: ReturnType<typeof forecastEndOfMonth> | null;
  eomBalance: number;
  curve: LiquidityCurve | null;
}) {
  if (!eom) {
    return (
      <LensFrame eyebrow="תחזית 30 ימים">
        <div className="fic-clean">אין עדיין תחזית. הוסף עוגן בנק להתחלה.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="תחזית 30 ימים">
      <div className="fic-forecast-chart">
        <Sparkline curve={curve} tone={eomBalance < 0 ? "danger" : "safe"} />
      </div>
      <ul className="fic-forecast-list">
        <ForecastItem
          label="יתרות עוגן"
          value={eom.totalAnchors}
          sign="+"
          tone="safe"
        />
        <ForecastItem
          label="הכנסות צפויות"
          value={eom.expectedIncome}
          sign="+"
          tone="safe"
        />
        <ForecastItem
          label="הוצאות קבועות"
          value={eom.pendingFixed}
          sign="−"
          tone="watch"
        />
        <ForecastItem
          label="הלוואות"
          value={eom.pendingLoans}
          sign="−"
          tone="purple"
        />
        <ForecastItem
          label="פרוסות אשראי"
          value={eom.futureCardSlices}
          sign="−"
          tone="cyan"
        />
        <ForecastItem
          label="תחזית סוף חודש"
          value={eomBalance}
          sign={eomBalance < 0 ? "−" : "+"}
          tone={eomBalance < 0 ? "danger" : "safe"}
          emphasize
        />
      </ul>
    </LensFrame>
  );
}
function ForecastItem({
  label,
  value,
  sign,
  tone,
  emphasize,
}: {
  label: string;
  value: number;
  sign: "+" | "−";
  tone: "safe" | "watch" | "danger" | "cyan" | "purple";
  emphasize?: boolean;
}) {
  return (
    <li
      className="fic-forecast-item"
      data-tone={tone}
      data-emphasize={emphasize ? "true" : undefined}
    >
      <span className="fic-forecast-label">{label}</span>
      <span className="fic-forecast-value" data-mono="true" dir="ltr">
        {sign}
        {ILS.format(Math.round(Math.abs(value)))}
      </span>
    </li>
  );
}

function WeekLens({
  rows,
}: {
  rows: Array<{
    label: string;
    amount: number;
    date: Date;
    kind: "rule" | "loan";
  }>;
}) {
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="השבוע הקרוב · 7 ימים">
        <div className="fic-clean">אין חיובים ידועים ב-7 הימים הבאים.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="השבוע הקרוב · 7 ימים">
      <ul className="fic-rows">
        {rows.map((r, i) => (
          <li
            key={`${r.label}-${i}`}
            className="fic-row"
            data-tone={r.kind === "loan" ? "purple" : "cyan"}
          >
            <span aria-hidden className="fic-row-rail" />
            <div className="fic-row-body">
              <span className="fic-row-title">{r.label}</span>
              <span className="fic-row-meta">{DAY_FMT.format(r.date)}</span>
            </div>
            <span className="fic-row-amount" data-mono="true" dir="ltr">
              {ILS.format(Math.round(r.amount))}
            </span>
          </li>
        ))}
      </ul>
    </LensFrame>
  );
}

function RecsCarousel({
  rows,
  now,
}: {
  rows: AiInsight[];
  now: number;
}) {
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="המלצות AI">
        <div className="fic-clean">אין המלצות פעילות כרגע.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="המלצות AI">
      <div className="fic-carousel">
        {rows.slice(0, 8).map((ins) => {
          const status = statusOf(ins.id, now);
          const resolved = status === "resolved";
          const confidence = Math.round(ins.confidence * 100);
          return (
            <div
              key={ins.id}
              className="fic-carousel-card"
              data-resolved={resolved ? "true" : undefined}
            >
              <span className="fic-carousel-eyebrow">
                {confidence}% ביטחון
              </span>
              <span className="fic-carousel-title">{ins.title}</span>
              <span className="fic-carousel-body">{ins.body}</span>
              {ins.action ? (
                <span className="fic-carousel-action">
                  💡 {ins.action}
                </span>
              ) : null}
              <div className="fic-carousel-cta">
                {!resolved ? (
                  <>
                    <button
                      type="button"
                      className="fic-carousel-btn fic-carousel-btn-primary"
                      onClick={() => {
                        hapticTap();
                        markResolved(ins.id);
                      }}
                    >
                      החל
                    </button>
                    <button
                      type="button"
                      className="fic-carousel-btn"
                      onClick={() => {
                        hapticTap();
                        markResolved(ins.id);
                      }}
                    >
                      דחה
                    </button>
                  </>
                ) : (
                  <span className="fic-carousel-done">✓ הופעל</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </LensFrame>
  );
}

function TrendsLens({
  trends,
  mom,
}: {
  trends: ReturnType<typeof categoryTrends>;
  mom: ReturnType<typeof monthOverMonthTotals>;
}) {
  if (trends.length === 0 && mom.length === 0) {
    return (
      <LensFrame eyebrow="מגמות · חודשי">
        <div className="fic-clean">אין עדיין נתוני מגמה.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="מגמות · חודשי">
      {mom.length > 0 ? <MoMSpark points={mom} /> : null}
      <ul className="fic-rows">
        {trends.map((t) => {
          const cat = safeCategory(t.category);
          const dPct = t.deltaPct ?? 0;
          const up = dPct > 0;
          return (
            <li
              key={t.category}
              className="fic-row"
              data-tone={up ? "watch" : "safe"}
            >
              <span aria-hidden className="fic-row-rail" />
              <div className="fic-row-body">
                <span className="fic-row-title">{cat}</span>
                <span className="fic-row-meta">
                  {up ? "עלה" : "ירד"} {Math.abs(Math.round(dPct * 100))}%
                </span>
              </div>
              <span className="fic-row-amount" data-mono="true" dir="ltr">
                {up ? "+" : "−"}
                {ILS.format(Math.round(Math.abs(t.delta)))}
              </span>
            </li>
          );
        })}
      </ul>
    </LensFrame>
  );
}

function MoMSpark({
  points,
}: {
  points: ReturnType<typeof monthOverMonthTotals>;
}) {
  const shape = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.total);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const W = 300;
    const H = 46;
    const step = W / Math.max(1, values.length - 1);
    const barW = Math.max(6, step * 0.5);
    return values.map((v, i) => {
      const x = i * step;
      const height = Math.max(2, ((v - min) / range) * H);
      const y = H - height;
      return { x, y, height, barW, monthKey: points[i].monthKey };
    });
  }, [points]);
  if (!shape) return null;
  return (
    <svg
      viewBox={`0 0 300 46`}
      className="fic-mom-spark"
      preserveAspectRatio="none"
      aria-hidden
    >
      {shape.map((b, i) => (
        <motion.rect
          key={b.monthKey}
          x={b.x - b.barW / 2}
          y={b.y}
          width={b.barW}
          height={b.height}
          rx="3"
          fill="rgba(212, 175, 55, 0.6)"
          initial={{ scaleY: 0, transformOrigin: `${b.x} 46px` }}
          animate={{ scaleY: 1 }}
          transition={{
            delay: Math.min(i * 0.05, 0.25),
            duration: 0.42,
            ease: EASE,
          }}
        />
      ))}
    </svg>
  );
}

// ── Timeline ──────────────────────────────────────────────

function TimelineSection({
  events,
  now,
}: {
  events: ReturnType<typeof buildLiveEvents>;
  now: number;
}) {
  if (events.length === 0) return null;
  return (
    <section className="fic-timeline" aria-label="ציר זמן חי">
      <header className="fic-timeline-head">
        <span className="fic-timeline-eyebrow">ציר זמן חי</span>
        <span className="fic-timeline-count" data-mono="true" dir="ltr">
          {events.length}
        </span>
      </header>
      <ul className="fic-timeline-list">
        {events.map((ev, i) => {
          const tone: "safe" | "watch" | "danger" =
            ev.kind === "incomeUpdate"
              ? "safe"
              : ev.kind === "ruleEnding"
                ? "watch"
                : "danger";
          const glyph =
            tone === "safe" ? "🟢" : tone === "watch" ? "🟡" : "🔴";
          return (
            <li
              key={ev.id}
              className="fic-timeline-item"
              data-tone={tone}
              style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
            >
              <span aria-hidden className="fic-timeline-dot" />
              <span aria-hidden className="fic-timeline-glyph">{glyph}</span>
              <div className="fic-timeline-body">
                <span className="fic-timeline-label">{ev.label}</span>
                <span className="fic-timeline-when">
                  {formatRelative(ev.at, now)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Smart footer ──────────────────────────────────────────

function SmartFooter({
  events,
  now,
}: {
  events: ReturnType<typeof buildLiveEvents>;
  now: number;
}) {
  const today = events.filter((e) => now - e.at < 24 * 3600_000);
  const posCount = today.filter((e) => e.kind === "incomeUpdate").length;
  const attCount = today.filter(
    (e) => e.kind === "cardCharge" || e.kind === "bankCharge",
  ).length;
  const riskCount = today.filter((e) => e.kind === "ruleEnding").length;
  return (
    <section
      className="fic-footer"
      data-direction={
        riskCount > posCount ? "down" : posCount > 0 ? "up" : "flat"
      }
      aria-label="מה השתנה היום"
    >
      <span aria-hidden className="fic-footer-glyph">
        {riskCount > posCount ? "↓" : posCount > 0 ? "↑" : "→"}
      </span>
      <div className="fic-footer-body">
        <span className="fic-footer-title">מה השתנה היום</span>
        <span className="fic-footer-hint">
          {today.length === 0
            ? "לא זוהו אירועים חדשים ב-24 השעות האחרונות."
            : composeFooterLine(posCount, attCount, riskCount, today.length)}
        </span>
      </div>
    </section>
  );
}
function composeFooterLine(
  pos: number,
  att: number,
  risk: number,
  total: number,
): string {
  const parts: string[] = [];
  if (pos > 0) parts.push(`${pos} חיוביים`);
  if (att > 0) parts.push(`${att} דורש מבט`);
  if (risk > 0) parts.push(`${risk} סיכונים`);
  if (parts.length === 0) return `${total} אירועים`;
  return parts.join(" · ");
}

// ── Compute helpers ──────────────────────────────────────

function computeHealthScore(
  risks: AiInsight[],
  opportunities: AiInsight[],
  totalInsights: number,
): number {
  let score = 100;
  for (const r of risks) score -= r.severity * 6;
  score -= opportunities.length * 2;
  if (totalInsights === 0) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sumOpportunityImpact(opps: AiInsight[]): number {
  let sum = 0;
  for (const o of opps) {
    const m = o.body.match(/(\d[\d,]*)\s*₪|₪\s*(\d[\d,]*)/);
    if (m) {
      const num = Number((m[1] ?? m[2]).replace(/,/g, ""));
      if (Number.isFinite(num)) sum += num;
    }
  }
  return sum;
}

function sumWeek(
  week: Array<{ amount: number }>,
): number {
  return week.reduce((s, r) => s + r.amount, 0);
}

function collectUpcomingWeek(
  rules: RecurringRule[],
  loans: Loan[],
  nowMs: number,
): Array<{ label: string; amount: number; date: Date; kind: "rule" | "loan" }> {
  const now = new Date(nowMs || Date.now());
  const today = now.getDate();
  const y = now.getFullYear();
  const m = now.getMonth();
  const rows: Array<{
    label: string;
    amount: number;
    date: Date;
    kind: "rule" | "loan";
  }> = [];
  for (const r of rules) {
    if (!r.active) continue;
    const d = firingDate(y, m, today, r.dayOfMonth);
    if (!d) continue;
    rows.push({
      label: r.label,
      amount: r.estimatedAmount,
      date: d,
      kind: "rule",
    });
  }
  for (const l of loans) {
    if (!l.active) continue;
    const d = firingDate(y, m, today, l.dayOfMonth);
    if (!d) continue;
    rows.push({
      label: l.label,
      amount: l.monthlyInstallment,
      date: d,
      kind: "loan",
    });
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows.filter((r) => {
    const diff =
      (r.date.getTime() - startOfDay(now).getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7;
  });
}
function firingDate(
  y: number,
  m: number,
  today: number,
  dayOfMonth: number,
): Date | null {
  const clamped = Math.max(1, Math.min(31, dayOfMonth));
  if (clamped >= today) return new Date(y, m, clamped);
  return new Date(y, m + 1, clamped);
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** EOM balance derived from the liquidity-curve — the same
 *  source Home + Time consume. Returns null when the curve
 *  isn't ready so callers can fall back to `forecastEndOfMonth`. */
function pickEomFromCurve(curve: LiquidityCurve | null): number | null {
  if (!curve || curve.points.length === 0) return null;
  const now = new Date();
  const eomDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
  const targetT = eomDate.getTime();
  let best = curve.points[0];
  let bestDelta = Math.abs(new Date(best.whenISO).getTime() - targetT);
  for (const p of curve.points) {
    const d = Math.abs(new Date(p.whenISO).getTime() - targetT);
    if (d < bestDelta) {
      best = p;
      bestDelta = d;
    }
  }
  return Math.round(best.balance);
}

function safeCategory(id: string): string {
  try {
    return getCategory(id as CategoryId).label;
  } catch {
    return id;
  }
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "לילה טוב · אני בשקט מעקב";
  if (h < 11) return "בוקר טוב · מתחילים ביום שקט";
  if (h < 17) return "צהריים טובים · בואו נסקור";
  if (h < 21) return "ערב טוב · סיכום היום";
  return "לילה טוב · יום מסתיים";
}

function composeSummaryLines(
  chip: Chip,
  now: number,
  data: {
    eomForecast: ReturnType<typeof forecastEndOfMonth> | null;
    eomBalance: number;
    risks: AiInsight[];
    opportunities: AiInsight[];
    anomalies: SpendAnomaly[];
    week: Array<{ label: string; amount: number; date: Date; kind: "rule" | "loan" }>;
    savings: number;
  },
): Array<{ icon: string; text: string }> {
  const lines: Array<{ icon: string; text: string }> = [];
  const eom = data.eomForecast;
  const eomBalance = data.eomBalance;

  if (chip === "risk") {
    const urgent = data.risks.filter((r) => r.severity === 3).length;
    lines.push(
      urgent > 0
        ? { icon: "🚨", text: `${urgent} סיכונים דחופים דורשים התייחסות` }
        : eom && eomBalance >= 0
          ? { icon: "✅", text: "אין סכנה למינוס החודש" }
          : { icon: "⚠", text: "צפויה יתרה שלילית בסוף החודש" },
    );
    if (data.week.length > 0) {
      const soon = data.week[0];
      const days = Math.ceil(
        (soon.date.getTime() - (now || soon.date.getTime())) / 86_400_000,
      );
      lines.push({
        icon: "⚠",
        text: `בעוד ${Math.max(0, days)} ימים יורדים ${data.week.length} חיובים`,
      });
    }
    if (data.anomalies.length > 0) {
      lines.push({
        icon: "📉",
        text: `${data.anomalies.length} חריגות מהותיות החודש`,
      });
    } else {
      lines.push({ icon: "💰", text: `ניתן לחסוך ${ILS.format(Math.round(data.savings))}` });
    }
  } else if (chip === "cash") {
    lines.push({
      icon: "💧",
      text: eom
        ? `סוף חודש צפוי: ${ILS.format(Math.round(eomBalance))}`
        : "אין תחזית זמינה",
    });
    lines.push({
      icon: "📥",
      text: eom
        ? `הכנסות נותרות: ${ILS.format(Math.round(eom.expectedIncome))}`
        : "לא מוגדר",
    });
    lines.push({
      icon: "📤",
      text: eom
        ? `יציאות נותרות: ${ILS.format(
            Math.round(eom.pendingFixed + eom.pendingLoans + eom.futureCardSlices),
          )}`
        : "לא מוגדר",
    });
  } else if (chip === "savings") {
    lines.push({
      icon: "💰",
      text: `${data.opportunities.length} הזדמנויות חיסכון`,
    });
    lines.push({
      icon: "🎯",
      text: `פוטנציאל חיסכון: ${ILS.format(Math.round(data.savings))}`,
    });
    if (data.opportunities.length > 0) {
      lines.push({ icon: "💡", text: data.opportunities[0].title });
    } else {
      lines.push({ icon: "✅", text: "אין הזדמנויות חיסכון כרגע" });
    }
  } else if (chip === "forecast") {
    lines.push({
      icon: "📈",
      text: eom
        ? `יתרה צפויה בסוף החודש: ${ILS.format(Math.round(eomBalance))}`
        : "אין תחזית",
    });
    lines.push({
      icon: "🗓️",
      text: `${data.week.length} חיובים בשבוע הקרוב`,
    });
    lines.push({
      icon: "🔮",
      text: eom
        ? `בחודש הבא: ${addMonths(currentMonthKey(), 1)}`
        : "לא מוגדר",
    });
  } else {
    // AI chip
    lines.push({
      icon: "🤖",
      text: `Sally זיהתה ${data.risks.length + data.opportunities.length} תובנות פעילות`,
    });
    if (data.opportunities.length > 0) {
      lines.push({ icon: "💡", text: data.opportunities[0].title });
    }
    if (data.risks.length > 0) {
      lines.push({ icon: "⚠", text: data.risks[0].title });
    }
    while (lines.length < 3) {
      lines.push({ icon: "✅", text: "המצב יציב" });
    }
  }
  return lines.slice(0, 3);
}

void CreditCard;
void Sparkles;
void TrendingUp;
void TrendingDown;
void ChevronRight;
