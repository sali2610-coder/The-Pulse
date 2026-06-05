"use client";

// Phase 383 — Insights tab as AI Command Center.
//
// Layout:
//   1. "מה חדש השבוע" digest (max 3 short bullets)
//   2. עדכונים חיים — live events feed
//   3. 6 collapsed domain folders
//        💰 תזרים מזומנים
//        📈 הכנסות ומשכורות
//        💳 כרטיסי אשראי
//        🏦 חיובים קבועים והלוואות
//        ⚠️ סיכונים והתראות
//        🎯 הזדמנויות לחיסכון
//   4. CFO Sandbox (kept — already a premium AI surface)
//
// Engine math untouched. The tab composes existing gatherAiInsights
// output through three new pure helpers:
//   • bucketByDomain (insight-domain.ts)
//   • statusOf / markRead / markResolved / isArchived (insight-status.ts)
//   • buildLiveEvents / formatRelative (live-events.ts)

import dynamic from "next/dynamic";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  ChevronDown,
  Sparkles,
} from "lucide-react";

import { tap as hapticTap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { CfoSandboxCard } from "@/components/insights/cfo-sandbox-card";
import { gatherAiInsights, type AiInsight } from "@/lib/ai-insights";
import {
  bucketByDomain,
  DOMAIN_EMOJI,
  DOMAIN_LABEL,
  DOMAIN_TONE,
  type InsightDomain,
} from "@/lib/insight-domain";
import {
  isArchived,
  markRead,
  markResolved,
  statusOf,
  subscribe as subscribeStatus,
  type InsightStatusKind,
} from "@/lib/insight-status";
import { buildLiveEvents, formatRelative } from "@/lib/live-events";
import { ErrorBoundary } from "@/components/error-boundary";

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
const ActiveInstallmentsCard = lazy(() =>
  import("@/components/dashboard/active-installments-card").then((m) => ({
    default:
      m.ActiveInstallmentsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const SEV_TONE: Record<1 | 2 | 3, { dot: string; word: string }> = {
  1: { dot: "#34D399", word: "נמוך" },
  2: { dot: "#FBBF24", word: "בינוני" },
  3: { dot: "#F87171", word: "גבוה" },
};

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

  // Auto-cleanup: drop archived insights from the visible set.
  const visibleInsights: AiInsight[] = useMemo(() => {
    if (!ai) return [];
    return ai.insights.filter((i) => !isArchived(i.id, now));
  }, [ai, now]);

  const buckets = useMemo(
    () => bucketByDomain(visibleInsights),
    [visibleInsights],
  );

  // Digest — top 3 highest-priority titles, deduped.
  const digest = useMemo<AiInsight[]>(() => {
    const seen = new Set<string>();
    const out: AiInsight[] = [];
    for (const ins of visibleInsights) {
      const k = ins.title.trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ins);
      if (out.length >= 3) break;
    }
    return out;
  }, [visibleInsights]);

  const liveEvents = useMemo(
    () =>
      buildLiveEvents({
        entries,
        rules,
        incomes,
        now: new Date(now),
        cap: 6,
      }),
    [entries, rules, incomes, now],
  );

  return (
    <div className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-6 sm:gap-4 sm:pb-32">
      <header className="sm:col-span-6 flex items-center justify-between gap-3">
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
          לייב
        </span>
      </header>

      {/* AI Digest */}
      <section
        className="sm:col-span-6 glass-card rounded-3xl p-4"
        aria-label="מה חדש השבוע"
      >
        <div className="mb-2 flex items-center gap-2">
          <Bell className="size-4 text-gold/80" />
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            מה חדש השבוע
          </span>
        </div>
        {digest.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            אין שינוי משמעותי השבוע. Pulse ימשיך לעקוב.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {digest.map((d) => (
              <li
                key={d.id}
                className="flex items-start gap-2 text-[12.5px] text-foreground/90"
              >
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ background: SEV_TONE[d.severity].dot }}
                />
                <span>{d.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Live events feed */}
      <LiveEventsSection events={liveEvents} now={now} />

      {/* Six domain folders — collapsed by default */}
      <section className="sm:col-span-6 flex flex-col gap-2">
        {buckets.map((bucket) => (
          <DomainFolder
            key={bucket.domain}
            domain={bucket.domain}
            insights={bucket.insights}
            topSeverity={bucket.topSeverity}
            now={now}
            // Commitments folder includes the recurring rules panel
            // (moved out of Expenses).
            extra={
              bucket.domain === "commitments" ? (
                <div className="mt-2 flex flex-col gap-2">
                  <ErrorBoundary name="RecurringRulesPanel">
                    <RecurringRulesPanel />
                  </ErrorBoundary>
                  <ErrorBoundary name="ActiveInstallmentsCard">
                    <ActiveInstallmentsCard />
                  </ErrorBoundary>
                </div>
              ) : null
            }
          />
        ))}
      </section>

      {/* CFO Sandbox kept — it's already AI-first. */}
      <div className="sm:col-span-6">
        <CfoSandboxCard />
      </div>
    </div>
  );
}

function LiveEventsSection({
  events,
  now,
}: {
  events: ReturnType<typeof buildLiveEvents>;
  now: number;
}) {
  if (events.length === 0) return null;
  return (
    <section
      className="sm:col-span-6 glass-card rounded-3xl p-4"
      aria-label="עדכונים חיים"
    >
      <div className="mb-2 flex items-center gap-2">
        <Activity className="size-4 text-[#34D399]" />
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          עדכונים חיים
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="flex items-center justify-between gap-2 text-[12.5px]"
          >
            <span className="line-clamp-1 text-foreground/85">{ev.label}</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground">
              {formatRelative(ev.at, now)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DomainFolder({
  domain,
  insights,
  topSeverity,
  now,
  extra,
}: {
  domain: InsightDomain;
  insights: AiInsight[];
  topSeverity: 1 | 2 | 3 | 0;
  now: number;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tone = DOMAIN_TONE[domain];
  const dotColor =
    topSeverity === 3 ? "#F87171" : topSeverity === 2 ? "#FBBF24" : "#34D399";
  const visibleCount = insights.length + (extra ? 1 : 0);

  return (
    <section
      className="rounded-2xl border border-white/8 bg-white/[0.02] backdrop-blur-md"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <button
        type="button"
        onClick={() => {
          hapticTap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-right"
        dir="rtl"
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-xl text-[18px]"
          style={{ background: `${tone}1f` }}
        >
          {DOMAIN_EMOJI[domain]}
        </span>
        <div className="flex flex-1 flex-col leading-tight">
          <span className="text-[13.5px] font-medium text-foreground">
            {DOMAIN_LABEL[domain]}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {visibleCount === 0
              ? "אין תובנות חדשות"
              : `${visibleCount} פריטים`}
          </span>
        </div>
        {visibleCount > 0 ? (
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}`,
            }}
          />
        ) : null}
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-3.5 pb-3" dir="rtl">
              {insights.length === 0 && !extra ? (
                <p className="text-[11.5px] text-muted-foreground">
                  אין כרגע תובנות בקטגוריה הזו.
                </p>
              ) : null}
              {insights.map((ins) => (
                <InsightRow key={ins.id} insight={ins} now={now} />
              ))}
              {extra}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function InsightRow({
  insight,
  now,
}: {
  insight: AiInsight;
  now: number;
}) {
  const status: InsightStatusKind = statusOf(insight.id, now);
  const sev = SEV_TONE[insight.severity];
  const fadedByStatus = status !== "new";
  return (
    <div
      className="rounded-xl border border-white/8 bg-black/25 p-3"
      style={{ opacity: status === "resolved" ? 0.55 : 1 }}
    >
      <button
        type="button"
        onClick={() => {
          hapticTap();
          if (status === "new") markRead(insight.id);
        }}
        className="flex w-full flex-col gap-1.5 text-right"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: sev.dot }}
            />
            <span
              className="text-[13px] font-medium text-foreground"
              style={{ opacity: fadedByStatus ? 0.85 : 1 }}
            >
              {insight.title}
            </span>
          </span>
          <StatusChip status={status} />
        </div>
        <p className="text-[11.5px] leading-relaxed text-foreground/80">
          {insight.body}
        </p>
        {insight.why ? (
          <p className="text-[10.5px] text-muted-foreground">{insight.why}</p>
        ) : null}
        {insight.action ? (
          <p
            className="rounded-lg px-2 py-1.5 text-[11.5px]"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "var(--foreground)",
            }}
          >
            💡 {insight.action}
          </p>
        ) : null}
      </button>
      {status !== "resolved" ? (
        <button
          type="button"
          onClick={() => {
            hapticTap();
            markResolved(insight.id);
          }}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] text-foreground/80 transition-colors hover:border-white/20"
        >
          סמן כטופל
        </button>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: InsightStatusKind }) {
  const label =
    status === "new" ? "חדש" : status === "read" ? "נקרא" : "טופל";
  const tone =
    status === "new"
      ? "#22D3EE"
      : status === "read"
        ? "rgba(255,255,255,0.55)"
        : "#34D399";
  return (
    <span
      className="rounded-full border px-1.5 py-0.5 text-[9.5px]"
      style={{
        color: tone,
        borderColor: `${tone}55`,
      }}
    >
      {label}
    </span>
  );
}
