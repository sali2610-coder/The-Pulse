"use client";

// Phase 446 · AURORA recovery — Financial Insights Center
//
// Recovery of the legacy Insights tab. UI-only consumer of
// gatherAiInsights via useAuroraInsights. No new detection logic.

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";

import {
  useAuroraInsights,
  type AuroraInsight,
  type AuroraInsightBucket,
  type AuroraInsightPriority,
  type AuroraInsightsData,
} from "./use-aurora-insights";

const PRIORITY_LABEL: Record<AuroraInsightPriority, string> = {
  critical: "דחוף",
  high: "חשוב",
  normal: "לתשומת לב",
  calm: "התקדמות",
};

const GROUP_ICON: Record<string, string> = {
  risk: "!",
  prediction: "◔",
  opportunity: "✧",
  trend: "↗",
  positive: "✓",
  recommendation: "◈",
};

function priorityColor(band: AuroraInsightPriority): string {
  switch (band) {
    case "critical":
      return "var(--aurora-state-danger)";
    case "high":
      return "var(--aurora-state-watch)";
    case "calm":
      return "var(--aurora-state-safe)";
    case "normal":
    default:
      return "var(--aurora-brand-aurora-2)";
  }
}

export function AuroraInsightsCenter() {
  const data = useAuroraInsights();
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = useMemo(
    () => data.insights.find((i) => i.id === openId) ?? null,
    [data.insights, openId],
  );

  if (!data.ready) return null;
  if (data.total === 0) {
    return (
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "מרכז תובנות פיננסיות" }}>
          מרכז תובנות פיננסיות
        </Eyebrow>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          אין כרגע תובנות דחופות. מנוע Pulse ימשיך לסרוק את החודש ויסמן פה כל שינוי משמעותי.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <Header data={data} />
      <SummaryRow data={data} />
      {data.headline ? (
        <HeadlineCard
          insight={data.headline}
          onOpen={() => setOpenId(data.headline!.id)}
        />
      ) : null}
      <div className="aurora-insights-buckets">
        {data.buckets.map((bucket) => (
          <BucketBlock
            key={bucket.group}
            bucket={bucket}
            onPick={(id) => setOpenId(id)}
          />
        ))}
      </div>

      <BottomSheet
        open={selected !== null}
        onOpenChange={(open) => (open ? null : setOpenId(null))}
        title={selected?.title ?? ""}
      >
        {selected ? <InsightDetail insight={selected} /> : null}
      </BottomSheet>
    </GlassCard>
  );
}

function Header({ data }: { data: AuroraInsightsData }) {
  return (
    <div className="aurora-card-row-top">
      <Eyebrow srHeading={{ level: 3, text: "מרכז תובנות" }}>
        מרכז תובנות · {data.monthKey}
      </Eyebrow>
      <span className="aurora-insights-count">
        {data.total} תובנות
      </span>
    </div>
  );
}

function SummaryRow({ data }: { data: AuroraInsightsData }) {
  return (
    <div className="aurora-insights-summary">
      <SummaryChip
        eyebrow="דחוף"
        value={data.criticalCount}
        color="var(--aurora-state-danger)"
      />
      <SummaryChip
        eyebrow="חשוב"
        value={data.urgentCount}
        color="var(--aurora-state-watch)"
      />
      <SummaryChip
        eyebrow="התקדמות"
        value={data.positiveCount}
        color="var(--aurora-state-safe)"
      />
      <SummaryChip
        eyebrow="סה״כ"
        value={data.total}
        color="var(--aurora-ink-1)"
      />
    </div>
  );
}

function SummaryChip({
  eyebrow,
  value,
  color,
}: {
  eyebrow: string;
  value: number;
  color: string;
}) {
  return (
    <div className="aurora-insights-summary-chip">
      <span className="aurora-insights-summary-eyebrow">{eyebrow}</span>
      <span
        dir="ltr"
        className="aurora-insights-summary-value"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function HeadlineCard({
  insight,
  onOpen,
}: {
  insight: AuroraInsight;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const tone = priorityColor(insight.priorityBand);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="aurora-insights-headline"
      style={{ borderColor: `${tone}66` }}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.45, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="aurora-insights-headline-head">
        <span
          className="aurora-insights-priority-pill"
          style={{ color: tone, borderColor: `${tone}55` }}
        >
          {PRIORITY_LABEL[insight.priorityBand]}
        </span>
        <span className="aurora-insights-group-label" style={{ color: tone }}>
          {insight.groupLabel}
        </span>
      </div>
      <h3 className="aurora-insights-headline-title">{insight.title}</h3>
      <p className="aurora-body aurora-ink-2">{insight.body}</p>
      {insight.action ? (
        <span
          className="aurora-insights-headline-action"
          style={{ color: tone }}
        >
          {insight.action} →
        </span>
      ) : null}
    </motion.button>
  );
}

function BucketBlock({
  bucket,
  onPick,
}: {
  bucket: AuroraInsightBucket;
  onPick: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <section className="aurora-insights-bucket">
      <header className="aurora-insights-bucket-head">
        <span
          aria-hidden
          className="aurora-insights-bucket-dot"
          style={{ background: bucket.toneColor }}
        />
        <span className="aurora-insights-bucket-title">{bucket.label}</span>
        <span className="aurora-insights-bucket-count">
          {bucket.insights.length}
        </span>
      </header>
      <ul className="aurora-insights-list">
        {bucket.insights.map((insight, i) => (
          <motion.li
            key={insight.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: {
                duration: reduced ? 0.12 : 0.32,
                delay: reduced ? 0 : i * 0.03,
                ease: [0.32, 0.72, 0, 1],
              },
            }}
          >
            <InsightRow insight={insight} onPick={() => onPick(insight.id)} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function InsightRow({
  insight,
  onPick,
}: {
  insight: AuroraInsight;
  onPick: () => void;
}) {
  const tone = priorityColor(insight.priorityBand);
  return (
    <button
      type="button"
      onClick={onPick}
      className="aurora-insight-row"
      style={{ borderColor: `${tone}55` }}
    >
      <span
        aria-hidden
        className="aurora-insight-badge"
        style={{ background: `${tone}1f`, color: tone }}
      >
        {GROUP_ICON[insight.group] ?? "•"}
      </span>
      <div className="aurora-insight-row-body">
        <div className="aurora-insight-row-head">
          <span className="aurora-insight-row-title">{insight.title}</span>
          <span
            className="aurora-insight-priority"
            style={{ color: tone }}
          >
            {PRIORITY_LABEL[insight.priorityBand]}
          </span>
        </div>
        <span className="aurora-insight-row-body-text">{insight.body}</span>
      </div>
      <span aria-hidden className="aurora-insight-row-chevron">
        ←
      </span>
    </button>
  );
}

function InsightDetail({ insight }: { insight: AuroraInsight }) {
  const tone = priorityColor(insight.priorityBand);
  return (
    <div className="aurora-insight-detail">
      <div className="aurora-insight-detail-head">
        <span
          className="aurora-insight-priority"
          style={{
            color: tone,
            borderColor: `${tone}55`,
            padding: "2px 8px",
            borderRadius: 9999,
            border: "1px solid",
            fontSize: 10,
          }}
        >
          {PRIORITY_LABEL[insight.priorityBand]} · {insight.groupLabel}
        </span>
        <h2 className="aurora-activity-detail-title">{insight.title}</h2>
        <p className="aurora-body-l aurora-ink-2">{insight.body}</p>
      </div>

      {insight.why ? (
        <section className="aurora-insight-detail-section">
          <Eyebrow>למה זה חשוב</Eyebrow>
          <p className="aurora-body aurora-ink-2">{insight.why}</p>
        </section>
      ) : null}

      {insight.action ? (
        <section className="aurora-insight-detail-section">
          <Eyebrow>מה כדאי לעשות עכשיו</Eyebrow>
          <p className="aurora-body aurora-ink-1">{insight.action}</p>
        </section>
      ) : null}

      <dl className="aurora-activity-detail-list">
        <Row label="חומרה" value={severityWord(insight.severity)} />
        <Row label="דחיפות" value={urgencyWord(insight.urgency)} />
        <Row
          label="רמת אמינות"
          value={`${Math.round(insight.confidence * 100)}%`}
        />
        <Row label="ניקוד עדיפות" value={`${Math.round(insight.priority)}`} />
      </dl>

      <p className="aurora-body aurora-ink-3">
        התובנות נבנות ממנוע הזיהוי של Pulse על סמך הנתונים בחודש הנוכחי. אין כאן ייעוץ פיננסי — רק הצפה של אותות שהמערכת רואה.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="aurora-activity-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function severityWord(s: 1 | 2 | 3): string {
  if (s === 3) return "גבוהה";
  if (s === 2) return "בינונית";
  return "רגועה";
}
function urgencyWord(u: 1 | 2 | 3): string {
  if (u === 3) return "עכשיו";
  if (u === 2) return "בקרוב";
  return "בהמשך";
}
