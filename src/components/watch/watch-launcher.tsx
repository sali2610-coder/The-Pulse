"use client";

// Watch · premium launcher for the Home "בדיקות, מנויים וחריגות"
// section.
//
// Three-part composition per the product rule:
//   1. Hero        — severity meter + total count of attention items.
//   2. Secondary   — 2 tone-tinted chips (חריגות / מנויים לבדיקה).
//   3. Details     — one expandable unified list of every item that
//                    needs a decision, each with a compact one-tap
//                    action (e.g., open drilldown / accept / dismiss).
//
// UI/UX only. Every value flows through the existing detectSpend-
// Anomalies + subscriptionReview + detectSubscriptionCandidates
// helpers. Store methods (addRule / toggleRule) route unchanged for
// the "אמץ מנוי" action; other actions are read-only drilldowns.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Sparkles,
  ShieldAlert,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { detectSpendAnomalies, type SpendAnomaly } from "@/lib/spend-anomalies";
import {
  subscriptionReview,
  type SubscriptionReviewCandidate,
  MIN_REVIEW_CONFIDENCE,
} from "@/lib/subscription-review";
import {
  detectSubscriptionCandidates,
  type SubscriptionCandidate,
} from "@/lib/subscriptions";
import { getCategory } from "@/lib/categories";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const EASE = [0.32, 0.72, 0, 1] as const;

type Row =
  | {
      key: string;
      kind: "anomaly";
      title: string;
      subtitle: string;
      amount: number;
      tone: "danger" | "watch";
      raw: SpendAnomaly;
    }
  | {
      key: string;
      kind: "review";
      title: string;
      subtitle: string;
      amount: number;
      tone: "watch";
      raw: SubscriptionReviewCandidate;
    }
  | {
      key: string;
      kind: "candidate";
      title: string;
      subtitle: string;
      amount: number;
      tone: "cyan";
      raw: SubscriptionCandidate;
    };

export function WatchLauncher() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const addRule = useFinanceStore((s) => s.addRule);

  const [detailsOpen, setDetailsOpen] = useState(false);

  const anomalies = useMemo<SpendAnomaly[]>(() => {
    if (!hydrated) return [];
    return detectSpendAnomalies({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);
  const review = useMemo<SubscriptionReviewCandidate[]>(() => {
    if (!hydrated) return [];
    return subscriptionReview({ rules, entries }).filter(
      (c) => c.confidence >= MIN_REVIEW_CONFIDENCE,
    );
  }, [hydrated, rules, entries]);
  const candidates = useMemo<SubscriptionCandidate[]>(() => {
    if (!hydrated) return [];
    return detectSubscriptionCandidates({ entries, rules });
  }, [hydrated, rules, entries]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const a of anomalies) {
      const cat = getCategory(a.category);
      out.push({
        key: `an-${a.category}`,
        kind: "anomaly",
        title: cat.label,
        subtitle: `${a.ratio.toFixed(1)}× מהממוצע · +${ILS.format(Math.round(a.delta))}`,
        amount: a.thisMonth,
        tone: a.severity === "alert" ? "danger" : "watch",
        raw: a,
      });
    }
    for (const r of review) {
      out.push({
        key: `rv-${r.ruleId}`,
        kind: "review",
        title: r.label,
        subtitle: r.reasonText,
        amount: r.amount,
        tone: "watch",
        raw: r,
      });
    }
    for (const c of candidates.slice(0, 5)) {
      out.push({
        key: `sc-${c.key}`,
        kind: "candidate",
        title: c.merchant,
        subtitle: `נצפה ב-${c.observations} חודשים · יום ${c.dayOfMonth}`,
        amount: c.estimatedAmount,
        tone: "cyan",
        raw: c,
      });
    }
    return out;
  }, [anomalies, review, candidates]);

  if (!hydrated) return <div className="ob-skeleton" aria-hidden />;

  const anomalyCount = anomalies.length;
  const reviewCount = review.length;
  const candidateCount = candidates.length;
  const totalAttention = anomalyCount + reviewCount + candidateCount;
  const worstAnomaly = anomalies[0] ?? null;

  const heroTone: "safe" | "watch" | "danger" =
    anomalies.some((a) => a.severity === "alert")
      ? "danger"
      : totalAttention > 0
        ? "watch"
        : "safe";

  return (
    <div className="wl-root" dir="rtl">
      <WatchHero
        total={totalAttention}
        tone={heroTone}
        worst={worstAnomaly}
      />

      <div className="wl-chips">
        <MetricChip
          label="חריגות"
          count={anomalyCount}
          tone={anomalyCount === 0 ? "safe" : "danger"}
          glyph={<AlertTriangle className="size-3.5" />}
        />
        <MetricChip
          label="מנויים לבדיקה"
          count={reviewCount}
          tone={reviewCount === 0 ? "safe" : "watch"}
          glyph={<ShieldAlert className="size-3.5" />}
        />
        <MetricChip
          label="מנויים חדשים"
          count={candidateCount}
          tone={candidateCount === 0 ? "safe" : "cyan"}
          glyph={<Sparkles className="size-3.5" />}
        />
      </div>

      <ExpandableDetails
        open={detailsOpen}
        onToggle={() => {
          hapticTap();
          setDetailsOpen((v) => !v);
        }}
        rowCount={rows.length}
      >
        {rows.length === 0 ? (
          <div className="ob-empty">אין פריטים לבדיקה. הכל תקין.</div>
        ) : (
          <ul className="wl-list">
            {rows.map((row) => (
              <WatchRow
                key={row.key}
                row={row}
                onAdopt={
                  row.kind === "candidate"
                    ? () => {
                        hapticTap();
                        addRule({
                          label: row.raw.merchant,
                          category: row.raw.category,
                          estimatedAmount: row.raw.estimatedAmount,
                          dayOfMonth: row.raw.dayOfMonth,
                          keywords: row.raw.keywords,
                        });
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </ExpandableDetails>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────

function WatchHero({
  total,
  tone,
  worst,
}: {
  total: number;
  tone: "safe" | "watch" | "danger";
  worst: SpendAnomaly | null;
}) {
  const reduced = useReducedMotion();
  const summary =
    tone === "safe"
      ? "הכל תקין החודש"
      : tone === "watch"
        ? "כדאי לתת מבט"
        : "דורש התייחסות";
  const worstLine = worst
    ? `החריגה הכי גדולה: ${getCategory(worst.category).label} · ${worst.ratio.toFixed(1)}× מהממוצע`
    : "אין חריגות מהותיות מהחודשים האחרונים";

  return (
    <section className="wl-hero" data-tone={tone} aria-label="מרכז בקרה">
      <span aria-hidden className="wl-hero-aurora" />
      <span aria-hidden className="wl-hero-glyph">
        {tone === "safe" ? (
          <Sparkles className="size-5" strokeWidth={1.6} />
        ) : (
          <AlertTriangle className="size-5" strokeWidth={1.6} />
        )}
      </span>
      <div className="wl-hero-numbers">
        <span className="wl-hero-eyebrow">מרכז בקרה</span>
        <motion.span
          key={total}
          initial={reduced ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.4, ease: EASE }}
          className="wl-hero-value"
          data-mono="true"
          dir="ltr"
        >
          {total}
        </motion.span>
        <span className="wl-hero-summary">{summary}</span>
      </div>
      <div className="wl-hero-hint">{worstLine}</div>
      <div className="wl-hero-bar">
        <motion.span
          className="wl-hero-bar-fill"
          initial={reduced ? undefined : { width: 0 }}
          animate={{ width: `${Math.min(100, total * 20)}%` }}
          transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
        />
      </div>
    </section>
  );
}

// ── Metric chip ───────────────────────────────────────────

function MetricChip({
  label,
  count,
  tone,
  glyph,
}: {
  label: string;
  count: number;
  tone: "safe" | "watch" | "danger" | "cyan";
  glyph: React.ReactNode;
}) {
  return (
    <div className="wl-chip" data-tone={tone}>
      <span aria-hidden className="wl-chip-glyph">
        {glyph}
      </span>
      <span className="wl-chip-label">{label}</span>
      <span className="wl-chip-count" data-mono="true" dir="ltr">
        {count}
      </span>
    </div>
  );
}

// ── Expandable details ────────────────────────────────────

function ExpandableDetails({
  open,
  onToggle,
  rowCount,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  rowCount: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <section className="il-details">
      <button
        type="button"
        className="il-details-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="il-details-head-text">
          <span className="il-details-eyebrow">
            פירוט מלא
          </span>
          <span className="il-details-title">
            {rowCount === 0
              ? "אין פריטים לבדיקה"
              : `${rowCount} פריטים לבדיקה`}
          </span>
        </div>
        <motion.span
          aria-hidden
          className="il-details-arrow"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduced ? 0.12 : 0.28, ease: EASE }}
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.4, ease: EASE }}
            className="il-details-body"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ── Row ───────────────────────────────────────────────────

function WatchRow({
  row,
  onAdopt,
}: {
  row: Row;
  onAdopt?: () => void;
}) {
  const reduced = useReducedMotion();
  const kindLabel =
    row.kind === "anomaly"
      ? "חריגה"
      : row.kind === "review"
        ? "מנוי לבדיקה"
        : "מנוי חדש";
  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.32, ease: EASE }}
      className="wl-row"
      data-tone={row.tone}
    >
      <span aria-hidden className="wl-row-rail" />
      <div className="wl-row-body">
        <div className="wl-row-line1">
          <span className="wl-row-kind">{kindLabel}</span>
          <span className="wl-row-title">{row.title}</span>
        </div>
        <span className="wl-row-sub">{row.subtitle}</span>
      </div>
      <div className="wl-row-right">
        <span className="wl-row-amount" data-mono="true" dir="ltr">
          {ILS.format(Math.round(row.amount))}
        </span>
        {onAdopt ? (
          <button
            type="button"
            className="wl-row-cta"
            onClick={onAdopt}
            aria-label="אמץ כמנוי קבוע"
          >
            אמץ
          </button>
        ) : (
          <span aria-hidden className="wl-row-cue">
            <ExternalLink className="size-3.5" />
          </span>
        )}
      </div>
    </motion.li>
  );
}
