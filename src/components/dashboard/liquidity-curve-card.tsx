"use client";

// Phase 209 — projected balance curve.
//
// Plots the day-by-day liquidity simulation produced by
// `liquidityCurve()` as a compact SVG sparkline. Surfaces:
//
//   * starting balance + balance at next salary
//   * lowest point on the curve (red marker)
//   * danger zone shading where balance < 0
//   * inline list of the 4 next dated events
//
// Auto-hides when there are no anchors — without a starting balance
// the curve has no meaning.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarClock,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  liquidityCurve,
  type LiquidityEvent,
  type LiquidityPoint,
} from "@/lib/liquidity-curve";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { CardEmpty } from "@/components/ui/card-empty";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const s = n > 0 ? "+" : "−";
  return `${s}${ILS.format(Math.abs(n))}`;
}

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const ICON: Record<LiquidityEvent["kind"], React.ReactNode> = {
  income: <Wallet className="size-3" />,
  card: <CreditCard className="size-3" />,
  loan: <CalendarClock className="size-3" />,
  bank_debit: <Landmark className="size-3" />,
};

const TONE: Record<LiquidityEvent["kind"], string> = {
  income: "#34D399",
  card: "#A78BFA",
  loan: "#F87171",
  bank_debit: "#60A5FA",
};

export function LiquidityCurveCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const curve = useMemo(() => {
    if (!hydrated) return null;
    return liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  if (!hydrated || !curve) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Activity />} title="עקומת נזילות 35 ימים" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="חסרה יתרת בנק נוכחית"
          reason="העקומה מתחילה מהיתרה שאתה מזין. בלי עוגן בנק אין מאיפה לצייר."
          unlockHint="הגדרות → חשבונות → הוסף חשבון בנק עם יתרה."
        />
      </section>
    );
  }

  const sparkPath = buildSparkPath(curve.points);
  const minTone = curve.crossesNegative ? "#F87171" : "#34D399";
  const severity: InsightSeverity = curve.crossesNegative
    ? "warn"
    : curve.lowestPoint.balance <= 1000
      ? "watch"
      : "info";
  const severityLabel = curve.crossesNegative
    ? "מינוס בחלון"
    : curve.lowestPoint.balance <= 1000
      ? "מרווח קצר"
      : "מצב יציב";

  // Show up to 4 nearest events for inline scan.
  const nearestEvents = curve.points
    .flatMap((p) =>
      p.events.map((e) => ({ ...e, whenISO: e.whenISO ?? p.whenISO })),
    )
    .slice(0, 4);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <SectionHeader
        icon={<Activity />}
        title={`עקומת נזילות ${curve.windowDays} ימים`}
        trailing={
          <InsightChip
            severity={severity}
            icon={
              curve.crossesNegative ? (
                <AlertTriangle className="size-2.5" />
              ) : undefined
            }
            label={severityLabel}
          />
        }
      />

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="היום"
          value={signed(curve.startingBalance)}
          tone={curve.startingBalance < 0 ? "neg" : "neutral"}
        />
        <Stat
          label="נקודה נמוכה"
          value={signed(curve.lowestPoint.balance)}
          sub={`יום ${curve.lowestPoint.dayIndex}`}
          tone={curve.crossesNegative ? "neg" : "neutral"}
        />
        <Stat
          label="לאחר משכורת"
          value={
            curve.balanceAtNextSalary !== null
              ? signed(curve.balanceAtNextSalary)
              : "—"
          }
          tone={
            curve.balanceAtNextSalary !== null && curve.balanceAtNextSalary < 0
              ? "neg"
              : "pos"
          }
        />
      </div>

      <Sparkline points={curve.points} pathD={sparkPath} minTone={minTone} />

      {nearestEvents.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {nearestEvents.map((e, idx) => (
            <li
              key={`${e.whenISO}:${e.label}:${idx}`}
              className="flex items-center gap-2 text-[11px]"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${TONE[e.kind]}22`, color: TONE[e.kind] }}
              >
                {ICON[e.kind]}
              </span>
              <span className="flex-1 truncate text-muted-foreground">
                {e.label}
              </span>
              <span className="shrink-0 text-muted-foreground/85" dir="ltr">
                {DATE_FMT.format(new Date(e.whenISO))}
              </span>
              <span
                data-mono="true"
                dir="ltr"
                className="w-16 shrink-0 text-end font-medium"
                style={{ color: e.amount > 0 ? "#34D399" : "#F87171" }}
              >
                {e.amount > 0 ? "+" : "−"}
                {ILS.format(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-white/8 pt-2 text-[11px] text-muted-foreground">
        <span>
          סך כניסות{" "}
          <span data-mono="true" dir="ltr" className="text-[#34D399]">
            +{ILS.format(curve.totalInflow)}
          </span>
        </span>
        <span>
          סך יציאות{" "}
          <span data-mono="true" dir="ltr" className="text-destructive">
            −{ILS.format(curve.totalOutflow)}
          </span>
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        העקומה מחושבת לפי תאריך הסליקה האמיתי של כל חיוב — לא תאריך הרכישה.
        חיובי כרטיס נופלים על יום החיוב של הכרטיס המבצע.
      </p>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neg" | "pos" | "neutral";
}) {
  const color = tone === "neg" ? "#F87171" : tone === "pos" ? "#34D399" : undefined;
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[13px] font-medium text-foreground"
        style={{ color }}
      >
        {value}
      </span>
      {sub ? (
        <span className="text-[10px] text-muted-foreground/85">{sub}</span>
      ) : null}
    </div>
  );
}

function Sparkline({
  points,
  pathD,
  minTone,
}: {
  points: LiquidityPoint[];
  pathD: { line: string; fill: string; w: number; h: number; minX: number; minY: number; zeroY: number | null };
  minTone: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2">
      <svg
        viewBox={`0 0 ${pathD.w} ${pathD.h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="עקומת נזילות"
        className="block h-24 w-full"
      >
        {/* Danger zone shading — area below y=0 line. */}
        {pathD.zeroY !== null ? (
          <rect
            x={0}
            y={pathD.zeroY}
            width={pathD.w}
            height={pathD.h - pathD.zeroY}
            fill="rgba(248,113,113,0.08)"
          />
        ) : null}
        {/* Zero line */}
        {pathD.zeroY !== null ? (
          <line
            x1={0}
            y1={pathD.zeroY}
            x2={pathD.w}
            y2={pathD.zeroY}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="2 4"
          />
        ) : null}
        {/* Fill under curve */}
        <path d={pathD.fill} fill="rgba(0,229,255,0.12)" />
        {/* Curve */}
        <path
          d={pathD.line}
          stroke="var(--neon)"
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Minimum marker */}
        <circle
          cx={pathD.minX}
          cy={pathD.minY}
          r={3}
          fill={minTone}
          stroke="#0A0A0A"
          strokeWidth={1.2}
        />
      </svg>
      <span
        className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] text-muted-foreground"
        dir="ltr"
      >
        {points.length - 1} ימים
      </span>
    </div>
  );
}

function buildSparkPath(points: LiquidityPoint[]) {
  if (points.length === 0) {
    return {
      line: "",
      fill: "",
      w: 100,
      h: 60,
      minX: 0,
      minY: 0,
      zeroY: null,
    };
  }
  const w = 600;
  const h = 120;
  const balances = points.map((p) => p.balance);
  const min = Math.min(...balances, 0);
  const max = Math.max(...balances, 0);
  const span = max - min || 1;
  const scaleX = (i: number) =>
    points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
  const scaleY = (v: number) => h - ((v - min) / span) * h;

  const segs = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(i).toFixed(1)} ${scaleY(p.balance).toFixed(1)}`);
  const line = segs.join(" ");
  const fill = `${line} L${scaleX(points.length - 1).toFixed(1)} ${h} L${scaleX(0).toFixed(1)} ${h} Z`;

  // Position of the trough.
  let minIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].balance < points[minIdx].balance) minIdx = i;
  }

  const zeroY = min < 0 && max > 0 ? scaleY(0) : null;

  return {
    line,
    fill,
    w,
    h,
    minX: scaleX(minIdx),
    minY: scaleY(points[minIdx].balance),
    zeroY,
  };
}
