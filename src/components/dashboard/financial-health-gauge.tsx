"use client";

// Phase 282 — premium financial-health gauge on Home.
// Phase 309 — wide horizontal redesign + tap-to-explain sheet.
//
// Reads `buildFinancialSnapshot` + `financialHealthScore` (same
// engine the rest of the dashboard uses), then presents:
//
//   • a wide 180° SVG arc with gradient track + animated needle
//   • 4 live context chips beside the gauge (EOM forecast, charges
//     this week, next salary, pending count)
//   • status pill ("מצוין / יציב / כדאי לעקוב / סיכון")
//   • a "פתח פירוט" call to action that opens a bottom sheet
//     explaining what hurts / helps the score and the next action
//
// No engine math here. Pure presentation + routing.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Activity,
  ArrowLeft,
  ChevronLeft,
  Lightbulb,
  ShieldCheck,
  TrendingDown,
  Wallet,
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
import { openAttentionCenter } from "@/lib/use-attention-center";
import { navigateToTab } from "@/lib/tab-nav";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

// Arc: 180° horizontal sweep from -180° (left, score 0) to 0° (right,
// score 100). All math in SVG coordinate space.
const VIEWBOX = { w: 280, h: 150 };
const CX = VIEWBOX.w / 2;
const CY = 132;
const R = 110;
const ARC_START_DEG = 180; // left edge
const ARC_END_DEG = 360; // right edge (sweeps through top)

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

function statusLabel(score: number): string {
  if (score >= 80) return "מצוין";
  if (score >= 60) return "יציב";
  if (score >= 40) return "כדאי לעקוב";
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
  const budgetMode = useFinanceStore((s) => s.budgetMode);

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

  const pendingCount = useMemo(() => {
    if (!hydrated) return 0;
    let n = 0;
    for (const e of entries) {
      if (e.needsConfirmation && !e.confirmedAt) n += 1;
    }
    return n;
  }, [hydrated, entries]);

  if (!hydrated || !snap) return null;

  const health = financialHealthScore(snap);
  const color = TONE_COLOR[health.tone];
  const needleDeg =
    ARC_START_DEG + ((ARC_END_DEG - ARC_START_DEG) * health.score) / 100;
  const needleEnd = polar(CX, CY, R - 14, needleDeg);
  const bigCharges = flow.filter((o) => o.amount >= 1000).length;
  const chargesCount = flow.length;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-black/40 to-white/[0.01] p-4 backdrop-blur-md"
        style={{
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -40px ${color}66`,
        }}
        aria-label={`מד בריאות פיננסית. ציון ${health.score} מתוך 100. ${health.label}.`}
      >
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setSheetOpen(true);
          }}
          aria-label="פתח פירוט בריאות פיננסית"
          className="flex w-full items-stretch gap-3 text-start"
        >
          {/* Gauge */}
          <div className="relative shrink-0">
            <svg
              viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
              className="block h-[120px] w-[210px]"
              role="img"
              aria-hidden
            >
              <defs>
                <linearGradient
                  id="hg-arc"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#F87171" />
                  <stop offset="55%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
                <filter
                  id="hg-glow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="2.6" result="blur" />
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
                strokeWidth={14}
                strokeLinecap="round"
                fill="none"
              />
              {/* Gradient arc */}
              <path
                d={describeArc(CX, CY, R, ARC_START_DEG, ARC_END_DEG)}
                stroke="url(#hg-arc)"
                strokeWidth={14}
                strokeLinecap="round"
                fill="none"
                opacity={0.9}
              />

              {/* Tick marks at 0/25/50/75/100 */}
              {[0, 25, 50, 75, 100].map((p) => {
                const deg =
                  ARC_START_DEG +
                  ((ARC_END_DEG - ARC_START_DEG) * p) / 100;
                const a = polar(CX, CY, R + 8, deg);
                const b = polar(CX, CY, R - 2, deg);
                return (
                  <line
                    key={p}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#ffffff44"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Needle */}
              <motion.line
                x1={CX}
                y1={CY}
                x2={needleEnd.x}
                y2={needleEnd.y}
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                filter="url(#hg-glow)"
                initial={false}
                animate={{ x2: needleEnd.x, y2: needleEnd.y }}
                transition={{ type: "spring", stiffness: 85, damping: 16 }}
              />
              {/* Pivot */}
              <circle
                cx={CX}
                cy={CY}
                r={5}
                fill="#0A0A0A"
                stroke={color}
                strokeWidth={2}
              />
              {/* Score text under pivot */}
              <text
                x={CX}
                y={CY - 28}
                textAnchor="middle"
                style={{
                  font: "300 28px ui-sans-serif, system-ui",
                  fill: color,
                }}
              >
                {health.score}
              </text>
              <text
                x={CX}
                y={CY - 12}
                textAnchor="middle"
                style={{
                  font: "10px ui-sans-serif, system-ui",
                  fill: "rgba(255,255,255,0.55)",
                }}
              >
                / 100
              </text>
            </svg>
          </div>

          {/* Right column — status + chips */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex size-1.5 rounded-full"
                style={{
                  background: color,
                  boxShadow: `0 0 10px ${color}`,
                }}
              />
              <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                בריאות פיננסית
              </span>
            </div>
            <StatusPill tone={health.tone} label={statusLabel(health.score)} />
            <p className="text-caption text-muted-foreground/85">
              {health.label}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
              <Lightbulb className="size-3" />
              פתח פירוט מלא
              <ChevronLeft className="size-3" />
            </div>
          </div>
        </button>

        {/* Chip strip — outside the tap target so chips remain
           independently clickable. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ChipButton
            icon={<TrendingDown className="size-3" />}
            label="צפי לסוף החודש"
            value={ILS.format(
              Math.round(snap.projectedBalanceWithoutDiscretionary),
            )}
            tone={
              snap.projectedBalanceWithoutDiscretionary < 0
                ? "#F87171"
                : "#60A5FA"
            }
            onClick={() => {
              hapticTap();
              navigateToTab("analytics");
            }}
          />
          <ChipButton
            icon={<AlertTriangle className="size-3" />}
            label="חיובים השבוע"
            value={
              chargesCount > 0
                ? `${chargesCount}${bigCharges > 0 ? " · " + bigCharges + " גדולים" : ""}`
                : "—"
            }
            tone={bigCharges > 0 ? "#F87171" : "#A78BFA"}
            onClick={() => {
              hapticTap();
              navigateToTab("history");
            }}
          />
          <ChipButton
            icon={<Wallet className="size-3" />}
            label="משכורת הבאה"
            value={
              nextIncomeDays === null
                ? "—"
                : nextIncomeDays === 0
                  ? "היום"
                  : nextIncomeDays === 1
                    ? "מחר"
                    : `בעוד ${nextIncomeDays} ימים`
            }
            tone="#34D399"
            onClick={() => {
              hapticTap();
              navigateToTab("history");
            }}
          />
          <ChipButton
            icon={<Activity className="size-3" />}
            label={
              pendingCount > 0
                ? "ממתינים לאישור"
                : `תקציב ${budgetMode === "auto" ? "אוטומטי" : "ידני"}`
            }
            value={
              pendingCount > 0
                ? `${pendingCount}`
                : budgetMode === "auto"
                  ? "auto"
                  : ILS.format(Math.round(monthlyBudget))
            }
            tone={pendingCount > 0 ? "#FBBF24" : "#22D3EE"}
            onClick={() => {
              hapticTap();
              if (pendingCount > 0) openAttentionCenter();
              else navigateToTab("settings");
            }}
          />
        </div>
      </motion.section>

      <HealthExplainSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        snap={snap}
        health={health}
        chargesCount={chargesCount}
        bigCharges={bigCharges}
        nextIncomeDays={nextIncomeDays}
      />
    </>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "ok" | "watch" | "danger";
  label: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={tone}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
        className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
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
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

function ChipButton({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      aria-label={`${label}: ${value}`}
      className="flex flex-col gap-0.5 rounded-2xl border px-2.5 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
      style={{
        background: `${tone}10`,
        borderColor: `${tone}33`,
      }}
    >
      <span
        className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/85"
      >
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12.5px] font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </motion.button>
  );
}

function HealthExplainSheet({
  open,
  onOpenChange,
  snap,
  health,
  chargesCount,
  bigCharges,
  nextIncomeDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snap: FinancialSnapshot;
  health: FinancialHealthScore;
  chargesCount: number;
  bigCharges: number;
  nextIncomeDays: number | null;
}) {
  const tone = TONE_COLOR[health.tone];

  // Derive "hurts" / "helps" lists from the same snapshot the score
  // came from. Pure presentation — no parallel math.
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
    helps.push(`עומק עוגן בריא — ${ILS.format(Math.round(snap.currentBalance))}`);
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
    health.tone === "danger"
      ? "פעל עכשיו: דחה חיוב גדול, הזרם הכנסה נוספת, או הקפא רכישה לא דחופה."
      : health.tone === "watch"
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
            style={{ background: `${tone}1f`, color: tone }}
          >
            <ShieldCheck className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">
              ציון בריאות: {health.score}/100
            </span>
            <span className="text-caption" style={{ color: tone }}>
              {health.label}
            </span>
          </div>
        </div>
      </header>

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
          background: `${tone}10`,
          borderColor: `${tone}33`,
        }}
      >
        <span
          className="text-caption font-medium"
          style={{ color: tone }}
        >
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
