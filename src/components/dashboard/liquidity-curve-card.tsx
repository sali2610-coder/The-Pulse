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

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarClock,
  CreditCard,
  Download,
  Landmark,
  Wallet,
  X,
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
import { curveToCsv, downloadCsv } from "@/lib/csv-export-forecast";
import { tap } from "@/lib/haptics";

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

  // Phase 292 — filter chip + selected day. Filter defaults to "all";
  // selectedDay null = no tooltip open. Hooks declared before any
  // early return so the React rules-of-hooks contract holds when the
  // user has no anchors (and the card auto-hides below).
  const [filter, setFilter] = useState<"all" | "income" | "card" | "loan" | "bank_debit">("all");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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

  // Show up to 4 nearest events for inline scan, filtered by the
  // active chip so the list explains the same lens the user picked
  // for the dot overlay.
  const allEvents = curve.points.flatMap((p, dayIdx) =>
    p.events.map((e) => ({
      ...e,
      whenISO: e.whenISO ?? p.whenISO,
      dayIdx,
    })),
  );
  const filteredEvents =
    filter === "all" ? allEvents : allEvents.filter((e) => e.kind === filter);
  const nearestEvents = filteredEvents.slice(0, 4);
  const selectedPoint =
    selectedDay !== null && selectedDay < curve.points.length
      ? curve.points[selectedDay]
      : null;

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
          <div className="flex items-center gap-2">
            <InsightChip
              severity={severity}
              icon={
                curve.crossesNegative ? (
                  <AlertTriangle className="size-2.5" />
                ) : undefined
              }
              label={severityLabel}
            />
            <button
              type="button"
              onClick={() => {
                tap();
                downloadCsv({
                  csv: curveToCsv(curve),
                  filename: `sally-liquidity-${new Date().toISOString().slice(0, 10)}.csv`,
                });
              }}
              aria-label="ייצוא CSV של עקומת נזילות"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
            >
              <Download className="size-3" />
              CSV
            </button>
          </div>
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

      <FilterRow
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setSelectedDay(null);
          tap();
        }}
      />

      <Sparkline
        points={curve.points}
        pathD={sparkPath}
        minTone={minTone}
        filter={filter}
        selectedDay={selectedDay}
        onSelectDay={(d) => {
          tap();
          setSelectedDay((cur) => (cur === d ? null : d));
        }}
      />

      <Legend />

      <AnimatePresence initial={false}>
        {selectedPoint ? (
          <motion.div
            key={`tooltip-${selectedDay}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <SelectedDayPanel
              point={selectedPoint}
              onClose={() => setSelectedDay(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

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

type FilterKind = "all" | "income" | "card" | "loan" | "bank_debit";

function Sparkline({
  points,
  pathD,
  minTone,
  filter,
  selectedDay,
  onSelectDay,
}: {
  points: LiquidityPoint[];
  pathD: { line: string; fill: string; w: number; h: number; minX: number; minY: number; zeroY: number | null; xs: number[]; ys: number[] };
  minTone: string;
  filter: FilterKind;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  // Phase 292 — per-day event dot overlay, colored by kind, sized by
  // |amount|. Filter dims non-matching dots; tapping selects a day so
  // the panel below can explain the movement. Each dot is a real
  // <button> equivalent for keyboard / SR support.
  const dots = useMemo(() => {
    const out: Array<{
      day: number;
      kind: LiquidityEvent["kind"];
      amount: number;
      x: number;
      y: number;
    }> = [];
    for (let day = 0; day < points.length; day++) {
      const x = pathD.xs[day];
      const y = pathD.ys[day];
      for (const ev of points[day].events) {
        out.push({ day, kind: ev.kind, amount: ev.amount, x, y });
      }
    }
    return out;
  }, [points, pathD]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2">
      <svg
        viewBox={`0 0 ${pathD.w} ${pathD.h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="עקומת נזילות"
        className="block h-32 w-full"
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
        <motion.path
          initial={false}
          animate={{ d: pathD.fill }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          fill="rgba(0,229,255,0.12)"
        />
        {/* Curve */}
        <motion.path
          initial={false}
          animate={{ d: pathD.line }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          stroke="var(--neon)"
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Per-event dots */}
        {dots.map((d, i) => {
          const isMatch = filter === "all" || d.kind === filter;
          const isSelected = selectedDay === d.day;
          const tone = TONE[d.kind];
          const r = Math.min(6, 2 + Math.log10(Math.max(10, Math.abs(d.amount))));
          return (
            <g key={`dot-${i}`} opacity={isMatch ? 1 : 0.22}>
              <circle
                cx={d.x}
                cy={d.y}
                r={isSelected ? r + 2.5 : r}
                fill={tone}
                stroke={isSelected ? "#0A0A0A" : "rgba(0,0,0,0.35)"}
                strokeWidth={isSelected ? 1.5 : 0.8}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectDay(d.day)}
                role="button"
                aria-label={`יום ${d.day} · אירוע`}
              />
            </g>
          );
        })}
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

const FILTER_OPTIONS: Array<{ value: FilterKind; label: string }> = [
  { value: "all", label: "הכל" },
  { value: "income", label: "הכנסות" },
  { value: "card", label: "כרטיסים" },
  { value: "loan", label: "הלוואות" },
  { value: "bank_debit", label: "חיובי בנק" },
];

function FilterRow({
  value,
  onChange,
}: {
  value: FilterKind;
  onChange: (next: FilterKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סינון לפי סוג">
      {FILTER_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const tone = opt.value === "all" ? "#E5E7EB" : TONE[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
              active ? "" : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
            }`}
            style={
              active
                ? {
                    background: `${tone}26`,
                    color: tone,
                    boxShadow: `inset 0 0 0 1px ${tone}55`,
                  }
                : undefined
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[10px] text-muted-foreground">
      <LegendItem color="#34D399" label="הכנסה" />
      <LegendItem color="#A78BFA" label="כרטיס" />
      <LegendItem color="#F87171" label="הלוואה" />
      <LegendItem color="#60A5FA" label="חיוב בנק" />
      <LegendItem color="var(--neon)" label="יתרה צפויה" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="size-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function SelectedDayPanel({
  point,
  onClose,
}: {
  point: LiquidityPoint;
  onClose: () => void;
}) {
  const income = point.events
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + e.amount, 0);
  const expense = point.events
    .filter((e) => e.kind !== "income")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  return (
    <section className="mt-1 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/35 p-3">
      <header className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-foreground">
          {DATE_FMT.format(new Date(point.whenISO))}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור פירוט יום"
          className="rounded-full border border-white/10 bg-black/40 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </header>
      {point.events.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/85">
          אין אירועים מתועדים ביום הזה. היתרה ממשיכה מהיום הקודם.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {point.events.map((e, i) => (
            <li
              key={`ev-${i}`}
              className="flex items-center gap-2 text-[11px]"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: `${TONE[e.kind]}22`,
                  color: TONE[e.kind],
                }}
              >
                {ICON[e.kind]}
              </span>
              <span className="flex-1 truncate text-foreground">{e.label}</span>
              <span
                data-mono="true"
                dir="ltr"
                className="text-[11px] font-medium"
                style={{ color: e.amount > 0 ? "#34D399" : "#F87171" }}
              >
                {e.amount > 0 ? "+" : "−"}
                {ILS.format(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px]">
        {income > 0 ? (
          <span dir="ltr" data-mono="true" className="text-[#34D399]">
            +{ILS.format(Math.round(income))}
          </span>
        ) : <span />}
        {expense > 0 ? (
          <span dir="ltr" data-mono="true" className="text-[#F87171]">
            −{ILS.format(Math.round(expense))}
          </span>
        ) : <span />}
        <span
          dir="ltr"
          data-mono="true"
          className="font-semibold"
          style={{ color: point.balance < 0 ? "#F87171" : "#34D399" }}
        >
          ≈ {ILS.format(Math.round(point.balance))}
        </span>
      </div>
    </section>
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
      xs: [] as number[],
      ys: [] as number[],
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

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points.length; i++) {
    xs.push(scaleX(i));
    ys.push(scaleY(points[i].balance));
  }
  const segs = points.map(
    (p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`,
  );
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
    xs,
    ys,
  };
}
