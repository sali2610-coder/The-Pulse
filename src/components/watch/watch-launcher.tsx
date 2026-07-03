"use client";

// Watch · premium 4-tile launcher for Home
// "בדיקות, מנויים וחריגות" section.
//
// Closed: four compact touch tiles in a 2×2 grid. Each tile shows a
// smart count + subtitle. Tap → inline lens with a SHORT summary of
// items — never a long list. Everything read-only or one-tap action.
// Data sources unchanged: detectSpendAnomalies, subscriptionReview,
// detectSubscriptionCandidates, entries.needsConfirmation.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  AlertTriangle,
  ExternalLink,
  FileWarning,
  ShieldAlert,
  Sparkles,
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

type Lens = "anomalies" | "review" | "candidates" | "missing" | null;

export function WatchLauncher() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const addRule = useFinanceStore((s) => s.addRule);

  const [lens, setLens] = useState<Lens>(null);

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
  const missing = useMemo(() => {
    if (!hydrated) return [];
    return entries.filter((e) => e.needsConfirmation && !e.confirmedAt);
  }, [hydrated, entries]);

  if (!hydrated) return <div className="ob-skeleton" aria-hidden />;

  function toggleLens(next: Lens) {
    hapticTap();
    setLens((prev) => (prev === next ? null : next));
  }

  const anomalySub =
    anomalies.length === 0
      ? "אין חריגות"
      : anomalies.some((a) => a.severity === "alert")
        ? "דחוף לבדוק"
        : "כדאי להעיף מבט";
  const reviewSub =
    review.length === 0 ? "הכל תקין" : "מנויים לבדיקה";
  const candidateSub =
    candidates.length === 0
      ? "אין מועמדים"
      : "לאמץ כחוזר";
  const missingSub =
    missing.length === 0
      ? "אין חוסרים"
      : "לאשר או להשלים";

  return (
    <div className="ob-dashboard" data-lens-open={lens ?? undefined} dir="rtl">
      <div className="ob-launcher-grid">
        <LauncherTile
          eyebrow="חריגות"
          headline={String(anomalies.length)}
          sub={anomalySub}
          tone={
            anomalies.length === 0
              ? "safe"
              : anomalies.some((a) => a.severity === "alert")
                ? "watch"
                : "watch"
          }
          glyph={<AlertTriangle className="size-4" />}
          active={lens === "anomalies"}
          dimmed={lens !== null && lens !== "anomalies"}
          onClick={() => toggleLens("anomalies")}
        />
        <LauncherTile
          eyebrow="מנויים לבדיקה"
          headline={String(review.length)}
          sub={reviewSub}
          tone={review.length === 0 ? "safe" : "gold"}
          glyph={<ShieldAlert className="size-4" />}
          active={lens === "review"}
          dimmed={lens !== null && lens !== "review"}
          onClick={() => toggleLens("review")}
        />
        <LauncherTile
          eyebrow="מנויים חדשים"
          headline={String(candidates.length)}
          sub={candidateSub}
          tone={candidates.length === 0 ? "safe" : "cyan"}
          glyph={<Sparkles className="size-4" />}
          active={lens === "candidates"}
          dimmed={lens !== null && lens !== "candidates"}
          onClick={() => toggleLens("candidates")}
        />
        <LauncherTile
          eyebrow="חוסרים / התראות"
          headline={String(missing.length)}
          sub={missingSub}
          tone={missing.length === 0 ? "safe" : "purple"}
          glyph={<FileWarning className="size-4" />}
          active={lens === "missing"}
          dimmed={lens !== null && lens !== "missing"}
          onClick={() => toggleLens("missing")}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {lens === "anomalies" ? (
          <AnomaliesLens key="anomalies" rows={anomalies} />
        ) : null}
        {lens === "review" ? (
          <ReviewLens key="review" rows={review} />
        ) : null}
        {lens === "candidates" ? (
          <CandidatesLens
            key="candidates"
            rows={candidates}
            onAdopt={(c) => {
              hapticTap();
              addRule({
                label: c.merchant,
                category: c.category,
                estimatedAmount: c.estimatedAmount,
                dayOfMonth: c.dayOfMonth,
                keywords: c.keywords,
              });
            }}
          />
        ) : null}
        {lens === "missing" ? (
          <MissingLens key="missing" rows={missing} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Launcher tile ────────────────────────────────────────

function LauncherTile({
  eyebrow,
  headline,
  sub,
  tone,
  glyph,
  active,
  dimmed,
  onClick,
}: {
  eyebrow: string;
  headline: string;
  sub: string;
  tone: "purple" | "cyan" | "safe" | "watch" | "gold" | "danger";
  glyph: React.ReactNode;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="ob-launcher"
      data-tone={tone}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${eyebrow} · ${headline}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="ob-launcher-halo" />
      <span aria-hidden className="ob-launcher-glyph">
        {glyph}
      </span>
      <span className="ob-launcher-eyebrow">{eyebrow}</span>
      <span className="ob-launcher-headline" data-mono="true" dir="ltr">
        {headline}
      </span>
      <span className="ob-launcher-sub" data-mono="true" dir="ltr">
        {sub}
      </span>
    </motion.button>
  );
}

// ── Lens frame ───────────────────────────────────────────

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
      className="ob-lens"
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
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">{eyebrow}</span>
        {right}
      </header>
      {children}
    </motion.section>
  );
}

// ── Anomalies lens ───────────────────────────────────────

function AnomaliesLens({ rows }: { rows: SpendAnomaly[] }) {
  const visible = rows.slice(0, 4);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="חריגות">
        <div className="wl-mini-clean">אין חריגות מהותיות החודש.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="חריגות החודש">
      <ul className="wl-mini-list">
        {visible.map((a) => {
          const cat = getCategory(a.category);
          return (
            <li
              key={a.category}
              className="wl-mini-row"
              data-tone={a.severity === "alert" ? "danger" : "watch"}
            >
              <span aria-hidden className="wl-mini-rail" />
              <div className="wl-mini-body">
                <span className="wl-mini-title">{cat.label}</span>
                <span className="wl-mini-meta">
                  {a.ratio.toFixed(1)}× מהממוצע · +
                  {ILS.format(Math.round(a.delta))}
                </span>
              </div>
              <span
                className="wl-mini-amount"
                data-mono="true"
                dir="ltr"
              >
                {ILS.format(Math.round(a.thisMonth))}
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 ? <div className="wl-mini-more">+ עוד {more}</div> : null}
    </LensFrame>
  );
}

// ── Review lens ──────────────────────────────────────────

function ReviewLens({ rows }: { rows: SubscriptionReviewCandidate[] }) {
  const visible = rows.slice(0, 4);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="מנויים לבדיקה">
        <div className="wl-mini-clean">כל המנויים תקינים.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="מנויים לבדיקה">
      <ul className="wl-mini-list">
        {visible.map((r) => (
          <li
            key={r.ruleId}
            className="wl-mini-row"
            data-tone="watch"
          >
            <span aria-hidden className="wl-mini-rail" />
            <div className="wl-mini-body">
              <span className="wl-mini-title">{r.label}</span>
              <span className="wl-mini-meta">{r.reasonText}</span>
            </div>
            <span
              className="wl-mini-amount"
              data-mono="true"
              dir="ltr"
            >
              {ILS.format(Math.round(r.amount))}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <div className="wl-mini-more">+ עוד {more}</div> : null}
    </LensFrame>
  );
}

// ── Candidates lens ──────────────────────────────────────

function CandidatesLens({
  rows,
  onAdopt,
}: {
  rows: SubscriptionCandidate[];
  onAdopt: (c: SubscriptionCandidate) => void;
}) {
  const visible = rows.slice(0, 4);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="מנויים חדשים">
        <div className="wl-mini-clean">לא זוהו מנויים חדשים.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="לאימוץ כמנוי קבוע">
      <ul className="wl-mini-list">
        {visible.map((c) => (
          <li
            key={c.key}
            className="wl-mini-row"
            data-tone="cyan"
          >
            <span aria-hidden className="wl-mini-rail" />
            <div className="wl-mini-body">
              <span className="wl-mini-title">{c.merchant}</span>
              <span className="wl-mini-meta">
                נצפה ב-{c.observations} חודשים · יום {c.dayOfMonth}
              </span>
            </div>
            <div className="wl-mini-right">
              <span
                className="wl-mini-amount"
                data-mono="true"
                dir="ltr"
              >
                {ILS.format(Math.round(c.estimatedAmount))}
              </span>
              <button
                type="button"
                className="wl-mini-cta"
                onClick={() => onAdopt(c)}
                aria-label={`אמץ את ${c.merchant} כמנוי קבוע`}
              >
                אמץ
              </button>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? <div className="wl-mini-more">+ עוד {more}</div> : null}
    </LensFrame>
  );
}

// ── Missing lens ─────────────────────────────────────────

type MissingRow = {
  id: string;
  merchant?: string;
  amount: number;
  chargeDate: string;
};

function MissingLens({ rows }: { rows: MissingRow[] }) {
  const visible = rows.slice(0, 4);
  const more = Math.max(0, rows.length - visible.length);
  if (rows.length === 0) {
    return (
      <LensFrame eyebrow="חוסרים / התראות">
        <div className="wl-mini-clean">אין חיובים ממתינים לאישור.</div>
      </LensFrame>
    );
  }
  return (
    <LensFrame eyebrow="חוסרים / התראות">
      <ul className="wl-mini-list">
        {visible.map((e) => (
          <li
            key={e.id}
            className="wl-mini-row"
            data-tone="purple"
          >
            <span aria-hidden className="wl-mini-rail" />
            <div className="wl-mini-body">
              <span className="wl-mini-title">
                {e.merchant ?? "חיוב ממתין"}
              </span>
              <span className="wl-mini-meta">ממתין לאישור המשתמש</span>
            </div>
            <div className="wl-mini-right">
              <span
                className="wl-mini-amount"
                data-mono="true"
                dir="ltr"
              >
                {ILS.format(Math.round(e.amount))}
              </span>
              <span aria-hidden className="wl-mini-cue">
                <ExternalLink className="size-3.5" />
              </span>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? <div className="wl-mini-more">+ עוד {more}</div> : null}
    </LensFrame>
  );
}
