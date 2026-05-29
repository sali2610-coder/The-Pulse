"use client";

// Phase 282 — premium financial-health gauge on Home.
// Phase 309 — wide horizontal redesign + tap-to-explain sheet.
// Phase 319 — compact luxury speedometer.
//
// The gauge is now a single hero widget: one premium SVG dial with
// metallic needle, neon-tone progress arc, dynamic color across four
// score bands, animated sweep on mount, and a center read-out (big
// score / status word / one smart sentence). The four context chips
// from Phase 309 are gone — they duplicated info the user already
// sees elsewhere and dragged the container's height up. Container
// is ~40% shorter and reads as a luxury HUD, not a report.
//
// Tap anywhere → BottomSheet with hurts / helps / recommended
// action (HealthExplainSheet, unchanged engine math).

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ShieldCheck,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildFinancialSnapshot,
  type FinancialSnapshot,
} from "@/lib/financial-snapshot";
import {
  financialHealthScore,
  type FinancialHealthScore,
} from "@/lib/financial-health-score";
import { upcomingOutflows } from "@/lib/upcoming-outflows";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { navigateToTab } from "@/lib/tab-nav";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

// 180° horizontal arc from -180° (score 0) to 0° (score 100).
const VIEWBOX = { w: 280, h: 138 };
const CX = VIEWBOX.w / 2;
const CY = 128;
const R = 102;
const ARC_START_DEG = 180;
const ARC_END_DEG = 360;

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

// Dynamic palette across four score bands:
//   0–30   crimson           (danger)
//   30–60  amber             (watch)
//   60–80  lime              (steady)
//   80–100 neon teal / mint  (excellent)
function pickTone(score: number): {
  fg: string;
  glow: string;
  band: "danger" | "watch" | "steady" | "neon";
} {
  if (score < 30) return { fg: "#F87171", glow: "#F87171", band: "danger" };
  if (score < 60) return { fg: "#F59E0B", glow: "#FBBF24", band: "watch" };
  if (score < 80) return { fg: "#A3E635", glow: "#84CC16", band: "steady" };
  return { fg: "#22D3EE", glow: "#34D399", band: "neon" };
}

function statusLabel(score: number): string {
  if (score >= 80) return "מצוין";
  if (score >= 60) return "יציב";
  if (score >= 40) return "זהירות";
  return "סיכון";
}

export function FinancialHealthGauge() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [sheetOpen, setSheetOpen] = useState(false);

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

  if (!hydrated || !snap) return null;

  const health = financialHealthScore(snap);
  const tone = pickTone(health.score);
  const needleDeg =
    ARC_START_DEG + ((ARC_END_DEG - ARC_START_DEG) * health.score) / 100;
  const needleTip = polar(CX, CY, R - 12, needleDeg);
  const needleBackTail = polar(CX, CY, 12, needleDeg + 180);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-black/45 to-white/[0.01] p-3 backdrop-blur-md"
        style={{
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${tone.glow}88, inset 0 0 60px ${tone.glow}10`,
        }}
        aria-label={`מד בריאות פיננסית. ציון ${health.score} מתוך 100. ${statusLabel(health.score)}.`}
      >
        {/* Faint radial wash behind the gauge — adds depth without
           competing with the arc gradient. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(60% 80% at 50% 100%, ${tone.glow}1f, transparent 70%)`,
          }}
        />

        <button
          type="button"
          onClick={() => {
            hapticTap();
            setSheetOpen(true);
          }}
          aria-label="פתח פירוט בריאות פיננסית"
          className="relative flex w-full flex-col items-center gap-1 text-center focus-visible:outline-none"
        >
          <header className="flex w-full items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <span
                className="inline-flex size-1.5 rounded-full"
                style={{
                  background: tone.fg,
                  boxShadow: `0 0 10px ${tone.glow}`,
                }}
              />
              בריאות פיננסית
            </span>
            <StatusPill score={health.score} tone={tone} />
          </header>

          <Speedometer
            score={health.score}
            tone={tone}
            needleTip={needleTip}
            needleBackTail={needleBackTail}
          />

          <p className="-mt-1 line-clamp-1 text-[11px] text-muted-foreground/85">
            {health.label}
          </p>

          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            פתח פירוט
            <ChevronLeft className="size-3" />
          </span>
        </button>
      </motion.section>

      <HealthExplainSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        snap={snap}
        health={health}
      />
    </>
  );
}

function Speedometer({
  score,
  tone,
  needleTip,
  needleBackTail,
}: {
  score: number;
  tone: ReturnType<typeof pickTone>;
  needleTip: { x: number; y: number };
  needleBackTail: { x: number; y: number };
}) {
  const ticks = [0, 25, 50, 75, 100];

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="block h-[132px] w-full max-w-[300px]"
      role="img"
      aria-hidden
    >
      <defs>
        {/* Multi-stop arc — crimson → amber → lime → neon teal. */}
        <linearGradient id="hg-arc" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F87171" />
          <stop offset="33%" stopColor="#F59E0B" />
          <stop offset="66%" stopColor="#A3E635" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>

        {/* Soft neon glow under needle + progress arc. */}
        <filter id="hg-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Metallic gradient for needle — bright edge, cool core. */}
        <linearGradient id="hg-needle" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="65%" stopColor={tone.fg} />
          <stop offset="100%" stopColor={tone.glow} />
        </linearGradient>

        {/* Hub gradient — dark glass dome. */}
        <radialGradient id="hg-hub" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1A1A1A" />
          <stop offset="80%" stopColor="#0A0A0A" />
        </radialGradient>
      </defs>

      {/* Outer dim ring — depth. */}
      <path
        d={describeArc(CX, CY, R + 8, ARC_START_DEG, ARC_END_DEG)}
        stroke="#ffffff08"
        strokeWidth={1}
        fill="none"
      />

      {/* Inner track. */}
      <path
        d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
        stroke="#ffffff14"
        strokeWidth={14}
        strokeLinecap="round"
        fill="none"
      />

      {/* Gradient arc — full sweep with depth via filter. */}
      <path
        d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
        stroke="url(#hg-arc)"
        strokeWidth={14}
        strokeLinecap="round"
        fill="none"
        opacity={0.95}
        filter="url(#hg-glow)"
      />

      {/* Tick marks + labels at 0/25/50/75/100. */}
      {ticks.map((p) => {
        const deg =
          ARC_START_DEG + ((ARC_END_DEG - ARC_START_DEG) * p) / 100;
        const outer = polar(CX, CY, R + 10, deg);
        const inner = polar(CX, CY, R - 2, deg);
        const label = polar(CX, CY, R + 22, deg);
        return (
          <g key={p}>
            <line
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="#ffffff55"
              strokeWidth={1.25}
            />
            <text
              x={label.x}
              y={label.y + 3}
              textAnchor="middle"
              style={{
                font: "500 9px ui-sans-serif, system-ui",
                fill: "rgba(255,255,255,0.55)",
              }}
            >
              {p}
            </text>
          </g>
        );
      })}

      {/* Sweep pulse — runs once on mount; fades. */}
      <motion.path
        d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
        stroke={tone.glow}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0.6 }}
        animate={{ pathLength: 1, opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 4px ${tone.glow})` }}
      />

      {/* Needle — outer glow stroke + bright metallic stroke. */}
      <motion.line
        x1={needleBackTail.x}
        y1={needleBackTail.y}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke={tone.glow}
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.45}
        initial={false}
        animate={{
          x1: needleBackTail.x,
          y1: needleBackTail.y,
          x2: needleTip.x,
          y2: needleTip.y,
        }}
        transition={{ type: "spring", stiffness: 70, damping: 14 }}
        filter="url(#hg-glow)"
      />
      <motion.line
        x1={needleBackTail.x}
        y1={needleBackTail.y}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke="url(#hg-needle)"
        strokeWidth={3}
        strokeLinecap="round"
        initial={false}
        animate={{
          x1: needleBackTail.x,
          y1: needleBackTail.y,
          x2: needleTip.x,
          y2: needleTip.y,
        }}
        transition={{ type: "spring", stiffness: 70, damping: 14 }}
      />

      {/* Hub — concentric metallic dome. */}
      <circle
        cx={CX}
        cy={CY}
        r={10}
        fill="url(#hg-hub)"
        stroke={`${tone.fg}88`}
        strokeWidth={1}
      />
      <circle cx={CX} cy={CY} r={3.5} fill={tone.fg} opacity={0.9} />

      {/* Center read-out — score + /100 + status. */}
      <motion.text
        x={CX}
        y={CY - 40}
        textAnchor="middle"
        initial={{ opacity: 0, y: CY - 30 }}
        animate={{ opacity: 1, y: CY - 40 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{
          font: "300 36px ui-sans-serif, system-ui",
          fill: tone.fg,
          letterSpacing: "-0.02em",
        }}
      >
        {score}
      </motion.text>
      <text
        x={CX}
        y={CY - 22}
        textAnchor="middle"
        style={{
          font: "10px ui-sans-serif, system-ui",
          fill: "rgba(255,255,255,0.5)",
          letterSpacing: "0.15em",
        }}
      >
        / 100
      </text>
    </svg>
  );
}

function StatusPill({
  score,
  tone,
}: {
  score: number;
  tone: ReturnType<typeof pickTone>;
}) {
  const label = statusLabel(score);
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={tone.band}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
        className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{
          background: `${tone.fg}1f`,
          color: tone.fg,
          boxShadow: `inset 0 0 0 1px ${tone.fg}33`,
        }}
      >
        {tone.band === "neon" ? (
          <ShieldCheck className="size-2.5" />
        ) : tone.band === "danger" ? (
          <AlertTriangle className="size-2.5" />
        ) : (
          <Activity className="size-2.5" />
        )}
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

function HealthExplainSheet({
  open,
  onOpenChange,
  snap,
  health,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snap: FinancialSnapshot;
  health: FinancialHealthScore;
}) {
  const tone = pickTone(health.score);

  // Compute supplemental context on demand — kept inside the sheet so
  // the main gauge stays a single-engine read.
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);

  const flow = useMemo(
    () =>
      upcomingOutflows({
        entries,
        rules,
        statuses,
        loans,
        horizonDays: 7,
      }),
    [entries, rules, statuses, loans],
  );
  const chargesCount = flow.length;
  const bigCharges = flow.filter((o) => o.amount >= 1000).length;
  const nextIncomeDays = useMemo(() => {
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
  }, [incomes]);

  const hurts: string[] = [];
  const helps: string[] = [];
  if (snap.projectedBalanceWithoutDiscretionary < 0) {
    hurts.push(
      `הצפי לסוף החודש שלילי בכ-${ILS.format(Math.round(Math.abs(snap.projectedBalanceWithoutDiscretionary)))}`,
    );
  }
  if (snap.currentBalance <= 0) {
    hurts.push("היתרה הנוכחית קרובה לאפס או שלילית.");
  } else if (snap.currentBalance >= 20_000) {
    helps.push(
      `עומק עוגן בריא — ${ILS.format(Math.round(snap.currentBalance))}`,
    );
  }
  const pendingObligations =
    snap.fixedExpensesUntilNextMonth +
    snap.installmentPaymentsUntilNextMonth +
    snap.activeLoansPaymentsUntilNextMonth;
  if (pendingObligations > 0) {
    hurts.push(
      `התחייבויות שעוד לא ירדו: ${ILS.format(Math.round(pendingObligations))}`,
    );
  }
  if (snap.expectedIncomeUntilNextMonth > 0) {
    helps.push(
      `הכנסה צפויה החודש: ${ILS.format(Math.round(snap.expectedIncomeUntilNextMonth))}`,
    );
  }
  if (bigCharges > 0) {
    hurts.push(`${bigCharges} חיובים גדולים מתקרבים השבוע`);
  } else if (chargesCount === 0) {
    helps.push("אין חיובים גדולים מתקרבים השבוע.");
  }
  if (nextIncomeDays !== null && nextIncomeDays <= 3) {
    helps.push(
      nextIncomeDays === 0
        ? "כניסת הכנסה צפויה היום."
        : nextIncomeDays === 1
          ? "כניסת הכנסה צפויה מחר."
          : `כניסת הכנסה צפויה בעוד ${nextIncomeDays} ימים.`,
    );
  }

  const action =
    tone.band === "danger"
      ? "פעל עכשיו: דחה חיוב גדול, הזרם הכנסה נוספת, או הקפא רכישה לא דחופה."
      : tone.band === "watch"
        ? "עקוב אחרי הקצב היומי, ובדוק אם אפשר להזיז חיוב כבד למועד אחר."
        : "שמור על הקצב הנוכחי. שווה לבדוק חיסכון או הפחתת חוב.";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="פירוט בריאות פיננסית"
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: `${tone.fg}1f`, color: tone.fg }}
          >
            <ShieldCheck className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">
              ציון בריאות: {health.score}/100
            </span>
            <span className="text-caption" style={{ color: tone.fg }}>
              {health.label}
            </span>
          </div>
        </div>
      </header>

      <p className="text-caption text-muted-foreground">
        הציון משוקלל מארבעה מנועים: עומק יתרה, צפי לסוף חודש, מינוף הוצאות
        קבועות וחוב, וכניסת הכנסה. ככל שהציון גבוה — הקצב יציב יותר.
      </p>

      {hurts.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <span
            className="text-caption font-medium"
            style={{ color: "#F87171" }}
          >
            מה פוגע בציון
          </span>
          <ul className="flex flex-col gap-1">
            {hurts.map((h, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl border border-[#F87171]/25 bg-[#F87171]/8 p-2.5 text-[12px] text-foreground"
              >
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[#F87171]" />
                {h}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {helps.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <span
            className="text-caption font-medium"
            style={{ color: "#34D399" }}
          >
            מה מחזיק את הציון
          </span>
          <ul className="flex flex-col gap-1">
            {helps.map((h, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl border border-[#34D399]/25 bg-[#34D399]/8 p-2.5 text-[12px] text-foreground"
              >
                <ShieldCheck className="mt-0.5 size-3 shrink-0 text-[#34D399]" />
                {h}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="rounded-2xl border px-3 py-2.5"
        style={{
          background: `${tone.fg}10`,
          borderColor: `${tone.fg}33`,
        }}
      >
        <span className="text-caption font-medium" style={{ color: tone.fg }}>
          💡 פעולה מומלצת
        </span>
        <p className="mt-1 text-[12px] text-foreground/90">{action}</p>
      </section>

      <button
        type="button"
        onClick={() => {
          hapticTap();
          onOpenChange(false);
          navigateToTab("analytics");
        }}
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
      >
        פתח הוצאות + פירוט CFO
        <ArrowLeft className="size-3" />
      </button>
    </BottomSheet>
  );
}
