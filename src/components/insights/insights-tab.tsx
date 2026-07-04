"use client";

// Insights · Financial Intelligence Center (cockpit rebuild).
//
// Prior tab was a long stack: digest + live events + 6 domain
// folders + panels. Rebuilt as one cockpit dashboard:
//
//   1. Hero — animated health-score ring + status label.
//   2. 6 launcher tiles (2×3 grid) — risks, opportunities, spend
//      anomalies, next-week charges, commitments, AI recommendations.
//      Tap a tile → inline lens under the grid with capped rows.
//   3. Delta card — 'המצב השתנה מאז אתמול' with mini metric strip.
//   4. CFO Sandbox — kept as the AI simulation surface.
//
// UI/UX only. gatherAiInsights + detectSpendAnomalies + all
// downstream engines untouched.

import dynamic from "next/dynamic";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Lightbulb,
  TrendingDown,
} from "lucide-react";

import { tap as hapticTap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { CfoSandboxCard } from "@/components/insights/cfo-sandbox-card";
import { gatherAiInsights, type AiInsight } from "@/lib/ai-insights";
import {
  markResolved,
  statusOf,
  subscribe as subscribeStatus,
  type InsightStatusKind,
} from "@/lib/insight-status";
import { detectSpendAnomalies, type SpendAnomaly } from "@/lib/spend-anomalies";
import { getCategory } from "@/lib/categories";
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

const lazy = (
  loader: () => Promise<{
    default: React.ComponentType<Record<string, unknown>>;
  }>,
) => dynamic(loader, { ssr: false });

const RecurringRulesPanel = lazy(() =>
  import("@/components/recurring/recurring-rules-panel").then((m) => ({
    default:
      m.RecurringRulesPanel as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// Tile identifiers.
type Lens =
  | "risks"
  | "opportunities"
  | "anomalies"
  | "week"
  | "commitments"
  | "recs"
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
  const [lens, setLens] = useState<Lens>(null);

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

  const anomalies = useMemo<SpendAnomaly[]>(() => {
    if (!hydrated) return [];
    return detectSpendAnomalies({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  const week = useMemo(() => collectUpcomingWeek(rules, loans, now), [
    rules,
    loans,
    now,
  ]);
  void incomes;

  if (!hydrated || !ai) return null;

  const insights = ai.insights;

  const risks = insights.filter((i) => i.group === "risk");
  const opportunities = insights.filter((i) => i.group === "opportunity");
  const commitments = insights.filter((i) => /rule|loan|installment|subscription|recurring|הלוואה|מנוי|תשלום/i.test(`${i.id} ${i.title} ${i.body}`));
  const recs = insights.filter(
    (i) =>
      i.group === "recommendation" ||
      i.group === "trend" ||
      i.group === "prediction" ||
      i.group === "positive",
  );

  const score = computeHealthScore(risks, opportunities, insights.length);
  const scoreStatus =
    score >= 80
      ? { label: "מצב טוב", tone: "safe" as const }
      : score >= 55
        ? { label: "כדאי לבדוק", tone: "watch" as const }
        : { label: "דורש התייחסות", tone: "danger" as const };

  const delta = computeDelta(risks, opportunities);

  function toggleLens(next: Lens) {
    hapticTap();
    setLens((prev) => (prev === next ? null : next));
  }

  return (
    <div className="ic-root" dir="rtl">
      <HealthHero
        score={score}
        status={scoreStatus}
        risksCount={risks.length}
        oppsCount={opportunities.length}
        commitCount={commitments.length}
      />

      <div className="ic-grid" data-lens-open={lens ?? undefined}>
        <IcTile
          icon={<AlertTriangle className="size-4" />}
          label="סיכונים"
          count={risks.length}
          tone="danger"
          active={lens === "risks"}
          dimmed={lens !== null && lens !== "risks"}
          onClick={() => toggleLens("risks")}
        />
        <IcTile
          icon={<Lightbulb className="size-4" />}
          label="הזדמנויות"
          count={opportunities.length}
          tone="watch"
          active={lens === "opportunities"}
          dimmed={lens !== null && lens !== "opportunities"}
          onClick={() => toggleLens("opportunities")}
        />
        <IcTile
          icon={<TrendingDown className="size-4" />}
          label="חריגים"
          count={anomalies.length}
          tone="danger"
          active={lens === "anomalies"}
          dimmed={lens !== null && lens !== "anomalies"}
          onClick={() => toggleLens("anomalies")}
        />
        <IcTile
          icon={<CalendarClock className="size-4" />}
          label="השבוע הקרוב"
          count={week.length}
          tone="cyan"
          active={lens === "week"}
          dimmed={lens !== null && lens !== "week"}
          onClick={() => toggleLens("week")}
        />
        <IcTile
          icon={<CreditCard className="size-4" />}
          label="חיובים"
          count={commitments.length}
          tone="purple"
          active={lens === "commitments"}
          dimmed={lens !== null && lens !== "commitments"}
          onClick={() => toggleLens("commitments")}
        />
        <IcTile
          icon={<Bot className="size-4" />}
          label="המלצות AI"
          count={recs.length}
          tone="gold"
          active={lens === "recs"}
          dimmed={lens !== null && lens !== "recs"}
          onClick={() => toggleLens("recs")}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {lens === "risks" ? (
          <InsightLens
            key="risks"
            eyebrow="סיכונים · דורש תשומת לב"
            rows={risks}
            now={now}
            tone="danger"
          />
        ) : null}
        {lens === "opportunities" ? (
          <InsightLens
            key="opportunities"
            eyebrow="הזדמנויות · חסוך יותר"
            rows={opportunities}
            now={now}
            tone="watch"
          />
        ) : null}
        {lens === "anomalies" ? (
          <AnomaliesLens key="anomalies" rows={anomalies} />
        ) : null}
        {lens === "week" ? (
          <WeekLens key="week" rows={week} />
        ) : null}
        {lens === "commitments" ? (
          <CommitmentsLens
            key="commitments"
            insights={commitments}
            now={now}
          />
        ) : null}
        {lens === "recs" ? (
          <InsightLens
            key="recs"
            eyebrow="המלצות AI"
            rows={recs}
            now={now}
            tone="gold"
          />
        ) : null}
      </AnimatePresence>

      <DeltaCard delta={delta} />

      <CfoSandboxCard />
    </div>
  );
}

// ── Health hero ────────────────────────────────────────────

function HealthHero({
  score,
  status,
  risksCount,
  oppsCount,
  commitCount,
}: {
  score: number;
  status: { label: string; tone: "safe" | "watch" | "danger" };
  risksCount: number;
  oppsCount: number;
  commitCount: number;
}) {
  const reduced = useReducedMotion();
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  const ratio = Math.max(0, Math.min(1, score / 100));
  return (
    <section className="ic-hero" data-tone={status.tone} aria-label="מצב פיננסי כללי">
      <span aria-hidden className="ic-hero-aurora" />
      <div className="ic-hero-ring">
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <defs>
            <linearGradient id="ic-hero-grad" x1="0" y1="0" x2="1" y2="1">
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
            strokeWidth="10"
          />
          <motion.circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="url(#ic-hero-grad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            transform="rotate(-90 80 80)"
            initial={reduced ? undefined : { strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: CIRC * (1 - ratio) }}
            transition={{ duration: reduced ? 0.12 : 1.1, ease: EASE }}
          />
        </svg>
        <div className="ic-hero-ring-center">
          <span className="ic-hero-eyebrow">SALLY · AI</span>
          <span className="ic-hero-score" data-mono="true" dir="ltr">
            {score}
          </span>
          <span className="ic-hero-of">/100</span>
        </div>
      </div>
      <div className="ic-hero-body">
        <span className="ic-hero-status">{status.label}</span>
        <span className="ic-hero-title">מצב פיננסי כללי</span>
        <ul className="ic-hero-metrics">
          <li>
            <span className="ic-hero-metric-label">סיכונים</span>
            <span
              className="ic-hero-metric-value"
              data-mono="true"
              dir="ltr"
            >
              {risksCount}
            </span>
          </li>
          <li>
            <span className="ic-hero-metric-label">הזדמנויות</span>
            <span
              className="ic-hero-metric-value"
              data-mono="true"
              dir="ltr"
            >
              {oppsCount}
            </span>
          </li>
          <li>
            <span className="ic-hero-metric-label">חיובים</span>
            <span
              className="ic-hero-metric-value"
              data-mono="true"
              dir="ltr"
            >
              {commitCount}
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

// ── Tile ───────────────────────────────────────────────────

function IcTile({
  icon,
  label,
  count,
  tone,
  active,
  dimmed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "danger" | "watch" | "cyan" | "purple" | "gold" | "safe";
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="ic-tile"
      data-tone={tone}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${label} · ${count}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="ic-tile-glyph">
        {icon}
      </span>
      <span className="ic-tile-label">{label}</span>
      <span className="ic-tile-count" data-mono="true" dir="ltr">
        {count === 0 ? "אין" : count}
      </span>
    </motion.button>
  );
}

// ── Lenses ─────────────────────────────────────────────────

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
      className="ic-lens"
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
      <header className="ic-lens-head">
        <span className="ic-lens-eyebrow">{eyebrow}</span>
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
        <div className="ic-mini-clean">אין פריטים בקטגוריה הזו.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow={eyebrow}>
      <ul className="ic-mini-list">
        {visible.map((ins) => (
          <InsightRow key={ins.id} ins={ins} now={now} tone={tone} />
        ))}
      </ul>
      {more > 0 ? <div className="ic-mini-more">+ עוד {more}</div> : null}
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
      className="ic-mini-row"
      data-tone={tone}
      data-resolved={resolved ? "true" : undefined}
    >
      <span aria-hidden className="ic-mini-rail" />
      <div className="ic-mini-body">
        <span className="ic-mini-title">{ins.title}</span>
        <span className="ic-mini-meta">{ins.body}</span>
        {ins.action ? (
          <span className="ic-mini-action">💡 {ins.action}</span>
        ) : null}
      </div>
      {!resolved ? (
        <button
          type="button"
          className="ic-mini-cta"
          onClick={() => {
            hapticTap();
            markResolved(ins.id);
          }}
          aria-label="סמן כטופל"
        >
          סמן כטופל
        </button>
      ) : (
        <span aria-hidden className="ic-mini-cue">✓</span>
      )}
    </li>
  );
}

function AnomaliesLens({ rows }: { rows: SpendAnomaly[] }) {
  const visible = rows.slice(0, 5);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="חריגים · לפי קטגוריה">
        <div className="ic-mini-clean">אין חריגות מהותיות החודש.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="חריגים · לפי קטגוריה">
      <ul className="ic-mini-list">
        {visible.map((a) => {
          const cat = getCategory(a.category);
          return (
            <li
              key={a.category}
              className="ic-mini-row"
              data-tone={a.severity === "alert" ? "danger" : "watch"}
            >
              <span aria-hidden className="ic-mini-rail" />
              <div className="ic-mini-body">
                <span className="ic-mini-title">{cat.label}</span>
                <span className="ic-mini-meta">
                  {a.ratio.toFixed(1)}× מהממוצע · +
                  {ILS.format(Math.round(a.delta))}
                </span>
              </div>
              <span className="ic-mini-amount" data-mono="true" dir="ltr">
                {ILS.format(Math.round(a.thisMonth))}
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 ? <div className="ic-mini-more">+ עוד {more}</div> : null}
    </LensFrame>
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
        <div className="ic-mini-clean">אין חיובים ידועים ב-7 הימים הבאים.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="השבוע הקרוב · 7 ימים">
      <ul className="ic-mini-list">
        {rows.map((r, i) => (
          <li
            key={`${r.label}-${i}`}
            className="ic-mini-row"
            data-tone={r.kind === "loan" ? "purple" : "cyan"}
          >
            <span aria-hidden className="ic-mini-rail" />
            <div className="ic-mini-body">
              <span className="ic-mini-title">{r.label}</span>
              <span className="ic-mini-meta">
                {DAY_FMT.format(r.date)}
              </span>
            </div>
            <span className="ic-mini-amount" data-mono="true" dir="ltr">
              {ILS.format(Math.round(r.amount))}
            </span>
          </li>
        ))}
      </ul>
    </LensFrame>
  );
}

function CommitmentsLens({
  insights,
  now,
}: {
  insights: AiInsight[];
  now: number;
}) {
  return (
    <LensFrame eyebrow="חיובים קבועים · תובנות + כללים">
      <div className="ic-inner">
        {insights.length === 0 ? (
          <div className="ic-mini-clean">אין תובנות פעילות על חיובים.</div>
        ) : (
          <ul className="ic-mini-list">
            {insights.slice(0, 4).map((ins) => (
              <InsightRow
                key={ins.id}
                ins={ins}
                now={now}
                tone="watch"
              />
            ))}
          </ul>
        )}
        <RecurringRulesPanel />
      </div>
    </LensFrame>
  );
}

// ── Delta card ────────────────────────────────────────────

function DeltaCard({
  delta,
}: {
  delta: { direction: "up" | "down" | "flat"; label: string; hint: string };
}) {
  return (
    <section className="ic-delta" data-direction={delta.direction}>
      <span aria-hidden className="ic-delta-glyph">
        {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}
      </span>
      <div className="ic-delta-body">
        <span className="ic-delta-title">המצב השתנה מאז אתמול</span>
        <span className="ic-delta-hint">{delta.label}</span>
        <span className="ic-delta-sub">{delta.hint}</span>
      </div>
    </section>
  );
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

function computeDelta(
  risks: AiInsight[],
  opportunities: AiInsight[],
): { direction: "up" | "down" | "flat"; label: string; hint: string } {
  const urgentRisks = risks.filter((r) => r.severity === 3).length;
  const total = risks.length + opportunities.length;
  if (urgentRisks > 0) {
    return {
      direction: "down",
      label: `${urgentRisks} סיכונים דחופים`,
      hint: "דורש התייחסות מיידית",
    };
  }
  if (risks.length > opportunities.length) {
    return {
      direction: "down",
      label: `${risks.length} סיכונים פעילים`,
      hint: "שים לב לשבוע הקרוב",
    };
  }
  if (opportunities.length > 0) {
    return {
      direction: "up",
      label: `${opportunities.length} הזדמנויות חדשות`,
      hint: "אפשר לחסוך יותר",
    };
  }
  if (total === 0) {
    return {
      direction: "flat",
      label: "המצב יציב",
      hint: "אין שינוי מהותי ב-24 השעות האחרונות",
    };
  }
  return {
    direction: "up",
    label: "המצב יציב",
    hint: `${total} תובנות פעילות · הכל תחת שליטה`,
  };
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
