"use client";

// Single-lens obligations container. 'השבוע הבא' button and the
// UpcomingOutflowsCard reveal it drove were dropped: the Time-tab
// insight tiles already cover next-week visibility, so a duplicate
// day-oriented list was redundant.
//
// One full-width toggle:
//   [ התחייבויות ]  → inline reveal of CashflowBucketsCard (by-source
//                     breakdown: bank / cards / loans). Second tap
//                     collapses. UI / UX only — CashflowBucketsCard
//                     internals + every underlying engine untouched.

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  CreditCard,
  Landmark,
  Layers,
} from "lucide-react";

import { ErrorBoundary } from "@/components/error-boundary";
import { SectionHeader } from "@/components/ui/section-header";
import { tap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import {
  buildCashFlowBuckets,
  type CashFlowBucketsReport,
} from "@/lib/cash-flow-bucket";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const CashflowBucketsCard = lazy(() =>
  import("@/components/dashboard/cashflow-buckets-card").then((m) => ({
    default:
      m.CashflowBucketsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

export function ObligationsAndWeek() {
  const [open, setOpen] = useState(false);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<Layers />}
        title="התחייבויות עתידיות"
        trailing={
          <span className="text-caption text-muted-foreground">
            {open ? "לחץ לסגירה" : "לחץ לפתיחה"}
          </span>
        }
      />
      <ErrorBoundary name="FutureObligationsSummary">
        <FutureObligationsSummary />
      </ErrorBoundary>
      <p className="text-caption text-muted-foreground">
        פירוט לפי מקור: בנק, כרטיסים, הלוואות. כל חיוב עם סכום, שם
        ותאריך.
      </p>

      <LensToggle open={open} onToggle={() => {
        tap();
        setOpen((v) => !v);
      }} />

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 0.24,
                delay: 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="pt-2"
            >
              <ErrorBoundary name="CashflowBucketsCard">
                <CashflowBucketsCard />
              </ErrorBoundary>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const ILS_FMT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const NEXT_DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

type SourceKey = "card" | "bank_debit" | "loan";
const SOURCE_LABEL: Record<SourceKey, string> = {
  card: "אשראי",
  bank_debit: "בנק",
  loan: "הלוואות",
};
const SOURCE_TONE: Record<SourceKey, string> = {
  card: "#75F5FF",
  bank_debit: "#34D399",
  loan: "#A78BFA",
};
const SOURCE_GLYPH: Record<SourceKey, React.ReactNode> = {
  card: <CreditCard className="size-3.5" />,
  bank_debit: <Landmark className="size-3.5" />,
  loan: <CalendarClock className="size-3.5" />,
};

/** Premium summary sitting on top of the future-obligations
 *  container. Same data source `buildCashFlowBuckets` used by
 *  the drilldown so numbers can never disagree. Reads store
 *  selectors only — no engine, calculation or business-logic
 *  change. */
function FutureObligationsSummary() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo<CashFlowBucketsReport | null>(() => {
    if (!hydrated) return null;
    return buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
  }, [hydrated, accounts, loans, rules, statuses, entries]);

  if (!hydrated || !report || report.buckets.length === 0) return null;

  // Aggregate per-source split.
  let totalCount = 0;
  const perSource: Record<SourceKey, number> = {
    card: 0,
    bank_debit: 0,
    loan: 0,
  };
  let earliest: Date | null = null;
  for (const b of report.buckets) {
    perSource[b.source] = (perSource[b.source] ?? 0) + b.monthlyTotal;
    totalCount += b.obligationCount;
    if (b.nextSettlementAt) {
      const d = new Date(b.nextSettlementAt);
      if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
    }
  }
  const total = report.totalCommitted;
  const share = (k: SourceKey) =>
    total > 0 ? Math.round((perSource[k] / total) * 100) : 0;

  return (
    <div className="foc-summary" role="group" aria-label="סיכום התחייבויות עתידיות">
      <span aria-hidden className="foc-summary-aurora" />
      <div className="foc-summary-head">
        <span className="foc-summary-eyebrow">סה״כ עתידי · 35 ימים</span>
        <span className="foc-summary-count" data-mono="true" dir="ltr">
          {totalCount}
        </span>
      </div>
      <SpringAmount value={total} className="foc-summary-amount" />
      <div className="foc-summary-meta">
        <span className="foc-summary-next">
          החיוב הקרוב:{" "}
          <span data-mono="true" dir="rtl" className="foc-summary-next-date">
            {earliest ? NEXT_DATE_FMT.format(earliest) : "—"}
          </span>
        </span>
        <span className="foc-summary-count-hint">
          {totalCount === 1 ? "התחייבות אחת" : `${totalCount} התחייבויות`}
        </span>
      </div>
      <div className="foc-summary-split" aria-hidden>
        {(Object.keys(perSource) as SourceKey[]).map((k) => {
          const w = share(k);
          if (w === 0) return null;
          return (
            <span
              key={k}
              className="foc-summary-split-seg"
              style={{
                width: `${w}%`,
                background: `linear-gradient(180deg, ${SOURCE_TONE[k]}dd, ${SOURCE_TONE[k]}99)`,
                boxShadow: `0 0 12px -4px ${SOURCE_TONE[k]}88`,
              }}
              title={`${SOURCE_LABEL[k]} · ${w}%`}
            />
          );
        })}
      </div>
      <ul className="foc-summary-legend">
        {(Object.keys(perSource) as SourceKey[]).map((k) => (
          <li key={k} className="foc-summary-legend-item">
            <span
              aria-hidden
              className="foc-summary-legend-glyph"
              style={{ background: `${SOURCE_TONE[k]}22`, color: SOURCE_TONE[k] }}
            >
              {SOURCE_GLYPH[k]}
            </span>
            <span className="foc-summary-legend-label">
              {SOURCE_LABEL[k]}
            </span>
            <span
              className="foc-summary-legend-value"
              data-mono="true"
              dir="ltr"
              style={{ color: SOURCE_TONE[k] }}
            >
              {share(k)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpringAmount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.5 });
  const text = useTransform(spring, (v) => ILS_FMT.format(Math.round(v)));
  mv.set(value);
  return (
    <motion.span
      className={className}
      data-mono="true"
      dir="ltr"
      aria-label={ILS_FMT.format(Math.round(value))}
    >
      <motion.span>{text}</motion.span>
    </motion.span>
  );
}

function LensToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={`${open ? "סגור" : "פתח"} פירוט התחייבויות לפי מקור`}
      title={`${open ? "סגור" : "פתח"} התחייבויות`}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={`group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        open
          ? "border-[color:var(--neon)]/45 bg-[color:var(--neon)]/15"
          : "border-white/8 bg-black/30 hover:border-white/16"
      }`}
      style={
        open
          ? {
              boxShadow:
                "0 12px 40px -20px rgba(0, 229, 255, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex size-9 items-center justify-center rounded-xl ${
            open ? "bg-[color:var(--neon)]/22 text-[color:var(--neon)]" : "bg-white/6 text-foreground"
          }`}
          aria-hidden
        >
          <Layers className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className={`text-[13.5px] font-semibold ${open ? "text-[color:var(--neon)]" : "text-foreground"}`}
          >
            התחייבויות
          </span>
          <span className="text-[10.5px] text-muted-foreground/85">
            לפי מקור · בנק · כרטיסים · הלוואות
          </span>
        </div>
      </div>
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className={open ? "text-[color:var(--neon)]" : "text-muted-foreground/70"}
        aria-hidden
      >
        <ChevronDown className="size-4" />
      </motion.span>
    </motion.button>
  );
}
