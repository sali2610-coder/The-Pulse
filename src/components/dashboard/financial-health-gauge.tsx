"use client";

// Phase 282 — premium financial-health gauge on Home.
//
// Single executive-cockpit surface: a glassmorphism arc that reads
// the snapshot's overall health as one needle. Engine reuse only —
// `buildFinancialSnapshot` + `financialHealthScore` produce the
// number; this component is presentation only.
//
// Below the needle the card surfaces two "live" micro chips:
//   • "המשכורת הבאה בעוד N ימים" — earliest upcoming Income.
//   • "N חיובים גדולים מתקרבים" — count of UpcomingOutflows ≥ ₪1,000
//     in the next 7 days.
//
// Returns null until the store hydrates so SSR + hydration match.

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { financialHealthScore } from "@/lib/financial-health-score";
import { upcomingOutflows } from "@/lib/upcoming-outflows";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

// Arc: 240° sweep from -120° (left) to +120° (right). Score 0 → -120,
// score 100 → +120. Needle pivots about (cx, cy).
const VIEWBOX = { w: 260, h: 160 };
const CX = VIEWBOX.w / 2;
const CY = 130;
const R = 96;
const ARC_START_DEG = 210;
const ARC_END_DEG = 330; // span = 120° via CCW in svg

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

const TONE_COLOR: Record<"ok" | "watch" | "danger", string> = {
  ok: "#34D399",
  watch: "#F59E0B",
  danger: "#F87171",
};

export function FinancialHealthGauge() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  const snap = useMemo(() => {
    if (!hydrated || !hasAnchors) return null;
    return buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    hasAnchors,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

  const flow = useMemo(() => {
    if (!hydrated) return [] as ReturnType<typeof upcomingOutflows>;
    return upcomingOutflows({
      entries,
      rules,
      statuses,
      loans,
      horizonDays: 7,
    });
  }, [hydrated, entries, rules, statuses, loans]);

  const nextIncomeDays = useMemo(() => {
    if (!hydrated) return null;
    const now = new Date();
    const todayDay = now.getDate();
    const daysInThisMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    let best: number | null = null;
    for (const inc of incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      const remaining =
        inc.dayOfMonth >= todayDay
          ? inc.dayOfMonth - todayDay
          : daysInThisMonth - todayDay + inc.dayOfMonth;
      if (best === null || remaining < best) best = remaining;
    }
    return best;
  }, [hydrated, incomes]);

  if (!hydrated || !snap) return null;

  const health = financialHealthScore(snap);
  const color = TONE_COLOR[health.tone];
  const needleDeg =
    ARC_START_DEG + ((ARC_END_DEG - ARC_START_DEG) * health.score) / 100;
  const needleEnd = polar(CX, CY, R - 12, needleDeg);
  const bigCharges = flow.filter((o) => o.amount >= 1000).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-md"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -40px ${color}55`,
      }}
      aria-label={`מד בריאות פיננסית. ציון ${health.score} מתוך 100. ${health.label}.`}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-1.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${color}` }}
          />
          <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            בריאות פיננסית
          </span>
        </div>
        <ToneBadge tone={health.tone} />
      </header>

      <div className="mt-2 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
          className="w-full max-w-[340px]"
          role="img"
          aria-hidden
        >
          <defs>
            <linearGradient id="gauge-arc" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F87171" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
            <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track */}
          <path
            d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
            stroke="#ffffff10"
            strokeWidth={16}
            strokeLinecap="round"
            fill="none"
          />
          {/* Active arc — gradient stops form the green→amber→red band. */}
          <path
            d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
            stroke="url(#gauge-arc)"
            strokeWidth={16}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />

          {/* Needle */}
          <motion.line
            x1={CX}
            y1={CY}
            x2={needleEnd.x}
            y2={needleEnd.y}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
            initial={false}
            animate={{ x2: needleEnd.x, y2: needleEnd.y }}
            transition={{ type: "spring", stiffness: 90, damping: 14 }}
          />
          {/* Pivot */}
          <circle cx={CX} cy={CY} r={6} fill="#0A0A0A" stroke={color} strokeWidth={2} />
        </svg>
      </div>

      <div className="-mt-6 flex flex-col items-center gap-1">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[40px] font-light leading-none"
          style={{ color }}
        >
          {health.score}
        </span>
        <span className="text-caption text-muted-foreground">
          {health.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {nextIncomeDays !== null ? (
          <LiveChip
            icon={<Wallet className="size-3" />}
            tone="#34D399"
            label={
              nextIncomeDays === 0
                ? "המשכורת הבאה — היום"
                : nextIncomeDays === 1
                  ? "המשכורת הבאה — מחר"
                  : `המשכורת הבאה בעוד ${nextIncomeDays} ימים`
            }
          />
        ) : null}
        {bigCharges > 0 ? (
          <LiveChip
            icon={<AlertTriangle className="size-3" />}
            tone="#F87171"
            label={`${bigCharges} חיובים גדולים מתקרבים`}
          />
        ) : null}
        <LiveChip
          icon={<Activity className="size-3" />}
          tone="#60A5FA"
          label={`צפי לסוף החודש: ${ILS.format(Math.round(snap.projectedBalanceWithoutDiscretionary))}`}
        />
      </div>
    </motion.section>
  );
}

function ToneBadge({ tone }: { tone: "ok" | "watch" | "danger" }) {
  const color = TONE_COLOR[tone];
  const text =
    tone === "ok" ? "בשליטה" : tone === "watch" ? "לעקוב" : "סיכון";
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={tone}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium"
        style={{
          background: `${color}1f`,
          color,
        }}
      >
        {tone === "ok" ? (
          <ShieldCheck className="size-3" />
        ) : tone === "danger" ? (
          <AlertTriangle className="size-3" />
        ) : (
          <Activity className="size-3" />
        )}
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

function LiveChip({
  icon,
  tone,
  label,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
      style={{
        color: tone,
        borderColor: `${tone}33`,
        background: `${tone}10`,
      }}
    >
      {icon}
      {label}
    </motion.span>
  );
}
