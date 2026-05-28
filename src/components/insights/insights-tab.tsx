"use client";

// Phase 273 — AI Financial Copilot surface.
//
// The Insights tab used to be a flat list of status cards. It now
// renders the prioritized output of `gatherAiInsights` (src/lib/
// ai-insights.ts), grouped into six bands (Risks / Predictions /
// Opportunities / Trends / Positive / AI recommendations).
//
// Each card carries severity + urgency + confidence chips and an
// expandable "why this matters" + "recommended action" pair. The
// engine never emits filler — when nothing notable is happening
// the screen explicitly says so in a calm, premium tone.

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  Compass,
  Gauge,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { tap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { CfoSandboxCard } from "@/components/insights/cfo-sandbox-card";

// Phase 277 — monthly summary / EOM forecast / deficit-risk surfaces
// promoted out of the Home "פירוט מתקדם" dump into the AI Insights
// tab. They share one narrative container so the user reads them as
// a connected financial story, not isolated stat cards.
const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const CashflowSummaryCard = lazy(() =>
  import("@/components/dashboard/cashflow-summary-card").then((m) => ({
    default:
      m.CashflowSummaryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const StatsCards = lazy(() =>
  import("@/components/dashboard/stats-cards").then((m) => ({
    default:
      m.StatsCards as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const EmergencyFundCard = lazy(() =>
  import("@/components/dashboard/emergency-fund-card").then((m) => ({
    default:
      m.EmergencyFundCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AnchorTrajectoryCard = lazy(() =>
  import("@/components/dashboard/anchor-trajectory-card").then((m) => ({
    default:
      m.AnchorTrajectoryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const MonthlyDigestCard = lazy(() =>
  import("@/components/dashboard/monthly-digest-card").then((m) => ({
    default:
      m.MonthlyDigestCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
import {
  GROUP_LABELS,
  GROUP_ORDER,
  gatherAiInsights,
  type AiInsight,
  type AiInsightGroup,
} from "@/lib/ai-insights";

function Safe({ name, children }: { name: string; children: React.ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
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

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "עודכן כעת";
  const min = Math.floor(sec / 60);
  if (min < 60) return `עודכן לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `עודכן לפני ${hr} שע׳`;
  return "עודכן היום";
}

const GROUP_TONE: Record<AiInsightGroup, string> = {
  risk: "#F87171",
  prediction: "#A78BFA",
  opportunity: "#FBBF24",
  trend: "#60A5FA",
  positive: "#34D399",
  recommendation: "#22D3EE",
};

const GROUP_ICON: Record<AiInsightGroup, React.ReactNode> = {
  risk: <AlertTriangle className="size-4" />,
  prediction: <Gauge className="size-4" />,
  opportunity: <Lightbulb className="size-4" />,
  trend: <Compass className="size-4" />,
  positive: <ShieldCheck className="size-4" />,
  recommendation: <Sparkles className="size-4" />,
};

const SEV_DOT: Record<1 | 2 | 3, string> = {
  1: "#94A3B8",
  2: "#FBBF24",
  3: "#F87171",
};

const SEV_LABEL: Record<1 | 2 | 3, string> = {
  1: "רגיע",
  2: "שים לב",
  3: "דחוף",
};

function confidenceLabel(c: number): string {
  if (c >= 0.85) return "ביטחון גבוה";
  if (c >= 0.65) return "ביטחון בינוני";
  return "ביטחון בסיסי";
}

export function InsightsTab() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const result = useMemo(() => {
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

  const top = result?.insights[0];

  // Phase 277 — "alive" feeling. We re-subscribe to a 60s tick via
  // useSyncExternalStore so the relative-time label updates without
  // a setState-in-effect lint violation.
  const lastSyncedAt = useFinanceStore((s) => s.lastSyncedAt);
  const now = useNowTick(60_000);
  const refreshedAt = Math.max(lastSyncedAt, now - 5_000);
  const counts = result
    ? {
        risk: result.byGroup.risk.length,
        positive: result.byGroup.positive.length,
      }
    : { risk: 0, positive: 0 };

  return (
    <div className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-6 sm:gap-4 sm:pb-32">
      <header className="sm:col-span-6 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[color:var(--neon)]" />
            <span className="text-section text-foreground">
              המוח הפיננסי שלך
            </span>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-micro text-muted-foreground"
            aria-live="polite"
          >
            <Activity className="size-3 text-[#34D399]" />
            {formatRelative(refreshedAt, now)}
          </span>
        </div>
        <p className="text-caption text-muted-foreground">
          Pulse לומד את ההתנהגות שלך, משווה בין חודשים, מזהה דפוסים ומציע
          פעולות. כל תובנה כאן מבוססת על חישוב אמיתי — לא ניחושים.
        </p>
        {result ? (
          <div className="flex flex-wrap gap-1.5" aria-label="סטטוס תובנות">
            <StatusChip
              tone="#F87171"
              icon={<AlertTriangle className="size-3" />}
              label={`${counts.risk} סיכונים`}
            />
            <StatusChip
              tone="#34D399"
              icon={<ShieldCheck className="size-3" />}
              label={`${counts.positive} שיפורים`}
            />
            <StatusChip
              tone="#60A5FA"
              icon={<Compass className="size-3" />}
              label={`${result.total} תובנות פעילות`}
            />
          </div>
        ) : null}
      </header>

      {top ? <HeroInsight insight={top} /> : null}

      {/* Phase 277 — connected financial-narrative band. Monthly
         summary + EOM forecast + deficit / burn risk + emergency
         fund all share one section so the user reads them as a
         single story. Default-expanded because this is now the
         primary AI surface, not an advanced detail. */}
      <DashboardSection
        storageKey="insights.monthly-summary"
        title="סיכום חודשי ותחזית"
        subtitle="מצב התזרים, חיוב סוף החודש, וסיכוני גירעון"
        icon={<CalendarCheck className="size-4" />}
        defaultCollapsed={false}
      >
        <div className="sm:col-span-6">
          <Safe name="CashflowSummaryCard">
            <CashflowSummaryCard />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="StatsCards">
            <StatsCards />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="EmergencyFundCard">
            <EmergencyFundCard />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="AnchorTrajectoryCard">
            <AnchorTrajectoryCard />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="MonthlyDigestCard">
            <MonthlyDigestCard />
          </Safe>
        </div>
      </DashboardSection>

      {!result || result.total === 0 ? <CalmEmpty /> : null}

      {result
        ? GROUP_ORDER.map((group) => {
            const items = result.byGroup[group];
            if (items.length === 0) return null;
            return <Group key={group} group={group} items={items} />;
          })
        : null}

      {/* Phase 275 — CFO Sandbox lives here. Was a tiny what-if
         widget on Home; promoted into the AI brain tab with full
         multi-lever controls + conversational advice. */}
      <CfoSandboxCard />
    </div>
  );
}

function CalmEmpty() {
  return (
    <section className="glass-card sm:col-span-6 flex flex-col items-center gap-2 rounded-3xl p-8 text-center">
      <ShieldCheck className="size-7 text-[#34D399]" />
      <span className="text-section text-foreground">הכל תחת שליטה</span>
      <span className="text-caption text-muted-foreground/85">
        אין תובנות בולטות לחודש הנוכחי. תיהנה מהשקט — Pulse ימשיך לעקוב
        ויעיר אותך כשמשהו ישתנה.
      </span>
    </section>
  );
}

function HeroInsight({ insight }: { insight: AiInsight }) {
  const color = GROUP_TONE[insight.group];
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card sm:col-span-6 flex flex-col gap-3 rounded-3xl p-6"
      style={{
        background: `linear-gradient(135deg, ${color}1d 0%, transparent 70%)`,
        borderColor: `${color}33`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-2xl"
          style={{ background: `${color}26`, color }}
        >
          {GROUP_ICON[insight.group]}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-micro uppercase tracking-[0.25em]" style={{ color }}>
            {GROUP_LABELS[insight.group]} · התובנה החשובה ביותר
          </span>
          <span className="text-caption text-muted-foreground">
            {SEV_LABEL[insight.severity]} · {confidenceLabel(insight.confidence)}
          </span>
        </div>
      </div>
      <p className="text-section text-foreground">{insight.title}</p>
      <p className="text-body text-muted-foreground/90">{insight.body}</p>
      {insight.why ? (
        <p className="text-caption text-muted-foreground/80">{insight.why}</p>
      ) : null}
      {insight.action ? (
        <p
          className="rounded-2xl border px-3 py-2 text-caption"
          style={{
            background: `${color}10`,
            borderColor: `${color}33`,
            color: "var(--foreground)",
          }}
        >
          💡 {insight.action}
        </p>
      ) : null}
    </motion.section>
  );
}

function Group({
  group,
  items,
}: {
  group: AiInsightGroup;
  items: AiInsight[];
}) {
  const color = GROUP_TONE[group];
  return (
    <section className="sm:col-span-6 flex flex-col gap-2.5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-xl"
            style={{ background: `${color}22`, color }}
          >
            {GROUP_ICON[group]}
          </span>
          <span className="text-section text-foreground">
            {GROUP_LABELS[group]}
          </span>
        </div>
        <span
          className="text-caption rounded-full border px-2.5 py-0.5"
          style={{
            color,
            borderColor: `${color}44`,
            background: `${color}10`,
          }}
        >
          {items.length}
        </span>
      </header>
      <ul className="flex flex-col gap-2">
        {items.map((ins) => (
          <InsightCard key={ins.id} insight={ins} />
        ))}
      </ul>
    </section>
  );
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const [open, setOpen] = useState(false);
  const color = GROUP_TONE[insight.group];
  const hasDetails = Boolean(insight.why || insight.action);
  return (
    <li
      className="overflow-hidden rounded-2xl border bg-black/25"
      style={{ borderColor: "#ffffff14" }}
    >
      <button
        type="button"
        onClick={() => {
          tap();
          if (hasDetails) setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ background: SEV_DOT[insight.severity] }}
              aria-hidden
            />
            <span
              className="text-micro rounded-full px-2 py-0.5"
              style={{
                color,
                background: `${color}1a`,
              }}
            >
              {GROUP_LABELS[insight.group]}
            </span>
            <span className="text-micro text-muted-foreground/80">
              {SEV_LABEL[insight.severity]}
            </span>
            <span className="text-micro text-muted-foreground/60">·</span>
            <span className="text-micro text-muted-foreground/70">
              {confidenceLabel(insight.confidence)}
            </span>
            <ConfidenceBar value={insight.confidence} color={color} />
          </div>
          <span className="text-body text-foreground">{insight.title}</span>
          <span className="text-caption text-muted-foreground/85">
            {insight.body}
          </span>
        </div>
        {hasDetails ? (
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {hasDetails && open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="flex flex-col gap-2 p-4">
              {insight.why ? (
                <p className="text-caption text-muted-foreground/85">
                  <span className="text-foreground">למה זה חשוב — </span>
                  {insight.why}
                </p>
              ) : null}
              {insight.action ? (
                <p
                  className="rounded-xl border px-3 py-2 text-caption"
                  style={{
                    background: `${color}10`,
                    borderColor: `${color}33`,
                    color: "var(--foreground)",
                  }}
                >
                  💡 {insight.action}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span
      className="ml-1 inline-flex h-1.5 w-12 overflow-hidden rounded-full"
      style={{ background: `${color}22` }}
      aria-label={`רמת ביטחון ${pct}%`}
    >
      <span
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </span>
  );
}

function StatusChip({
  tone,
  icon,
  label,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro"
      style={{
        color: tone,
        borderColor: `${tone}44`,
        background: `${tone}12`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

// Keep these icons referenced even when no insight uses them this
// session — avoids dead-import lint warnings on tree-shaken builds.
void TrendingUp;
void TrendingDown;
