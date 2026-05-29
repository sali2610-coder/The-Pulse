"use client";

// Phase 313 — תחזית תזרים חכמה (consolidated 35-day cashflow).
//
// Replaces the two stacked containers ("מסלול יתרת בנק" +
// "עקומת נזילות 35 ימים") that lived in the Future tab. They felt
// like duplicates and the user couldn't read either as a clear
// action signal. This single container delivers:
//
//   • header status pill (תקין / אזהרה / סיכון) + days-safe +
//     EOM balance KPI strip
//   • filter chips (הכל / הכנסות / הוצאות / כרטיסים / הלוואות / בנק)
//   • one interactive SVG curve with today marker, danger-zone
//     shading, per-event dots, tap-to-explain mini popup
//   • compact insights strip ("3 חיובים מתקרבים", etc.)
//
// Engine reuse: liquidityCurve() output only. No parallel math.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CreditCard,
  HandCoins,
  Landmark,
  ShieldCheck,
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
import { CardEmpty } from "@/components/ui/card-empty";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

type FilterKind = "all" | "income" | "card" | "loan" | "bank_debit";

const FILTERS: Array<{ value: FilterKind; label: string }> = [
  { value: "all", label: "הכל" },
  { value: "income", label: "הכנסות" },
  { value: "card", label: "כרטיסים" },
  { value: "loan", label: "הלוואות" },
  { value: "bank_debit", label: "חיובי בנק" },
];

const TONE: Record<LiquidityEvent["kind"], string> = {
  income: "#34D399",
  card: "#A78BFA",
  loan: "#F87171",
  bank_debit: "#60A5FA",
};

const ICON: Record<LiquidityEvent["kind"], React.ReactNode> = {
  income: <Wallet className="size-3" />,
  card: <CreditCard className="size-3" />,
  loan: <HandCoins className="size-3" />,
  bank_debit: <Landmark className="size-3" />,
};

type StatusBucket = "ok" | "watch" | "danger";

function statusFor(curve: ReturnType<typeof liquidityCurve>): {
  bucket: StatusBucket;
  label: string;
  daysSafe: number;
} {
  const days = curve.points.length - 1;
  if (curve.crossesNegative) {
    return {
      bucket: "danger",
      label: "סיכון",
      daysSafe: Math.max(0, curve.lowestPoint.dayIndex),
    };
  }
  if (curve.lowestPoint.balance < 1000) {
    return {
      bucket: "watch",
      label: "אזהרה",
      daysSafe: Math.max(0, curve.lowestPoint.dayIndex),
    };
  }
  return { bucket: "ok", label: "תקין", daysSafe: days };
}

const STATUS_TONE: Record<StatusBucket, string> = {
  ok: "#34D399",
  watch: "#F59E0B",
  danger: "#F87171",
};

export function CashflowForecast35() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
        <SectionHeader
          icon={<Activity />}
          title="תחזית תזרים חכמה"
        />
        <CardEmpty
          icon={<Landmark className="size-4" />}
          title="חסרה יתרת בנק נוכחית"
          reason="התחזית מתחילה מהיתרה שאתה מזין. בלי עוגן בנק אין מאיפה לצייר."
          unlockHint="הגדרות → חשבונות → הוסף חשבון בנק עם יתרה."
        />
      </section>
    );
  }

  const status = statusFor(curve);
  const tone = STATUS_TONE[status.bucket];

  const path = buildPath(curve.points);
  const selectedPoint =
    selectedDay !== null && selectedDay < curve.points.length
      ? curve.points[selectedDay]
      : null;

  const filtered = filterEvents(curve.points, filter);

  // Insights — short, one-liners.
  const upcomingBigCharges = filtered
    .flatMap((p, dayIdx) =>
      p.events.map((e) => ({ ...e, dayIdx })),
    )
    .filter((e) => e.kind !== "income" && Math.abs(e.amount) >= 1000);
  const upcomingIncomes = filtered
    .flatMap((p) => p.events)
    .filter((e) => e.kind === "income");
  const firstPressureDay = curve.crossesNegative
    ? curve.lowestPoint.dayIndex
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
        title="תחזית תזרים חכמה"
        trailing={
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${tone}1f`, color: tone }}
          >
            {status.bucket === "ok" ? (
              <ShieldCheck className="size-3" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
            {status.label}
          </span>
        }
      />

      <p className="text-[11px] text-muted-foreground/85">
        מצב הכסף שלך ב-{curve.windowDays} הימים הקרובים. הקש על נקודה
        בגרף כדי להבין מה קורה ביום הזה.
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Kpi
          label="יתרה לסוף חלון"
          value={ILS.format(
            Math.round(curve.points[curve.points.length - 1].balance),
          )}
          tone={
            curve.points[curve.points.length - 1].balance < 0
              ? "#F87171"
              : "#34D399"
          }
        />
        <Kpi
          label="יום סיכון ראשון"
          value={
            firstPressureDay !== null
              ? `בעוד ${firstPressureDay} ימים`
              : "אין"
          }
          tone={firstPressureDay !== null ? "#F87171" : "#34D399"}
        />
        <Kpi
          label="כרית ביטחון"
          value={ILS.format(Math.round(curve.lowestPoint.balance))}
          tone={
            curve.lowestPoint.balance < 0
              ? "#F87171"
              : curve.lowestPoint.balance < 1000
                ? "#F59E0B"
                : "#34D399"
          }
        />
      </div>

      <FilterRow
        value={filter}
        onChange={(next) => {
          hapticTap();
          setFilter(next);
          setSelectedDay(null);
        }}
      />

      <Sparkline
        points={curve.points}
        path={path}
        filter={filter}
        selectedDay={selectedDay}
        onSelectDay={(d) => {
          hapticTap();
          setSelectedDay((cur) => (cur === d ? null : d));
        }}
      />

      {/* Compact insights strip */}
      <div className="flex flex-wrap gap-1.5 text-[10.5px]">
        {upcomingBigCharges.length > 0 ? (
          <InsightChip
            tone="#F87171"
            icon={<AlertTriangle className="size-3" />}
            label={`${upcomingBigCharges.length} חיובים גדולים מתקרבים`}
          />
        ) : null}
        {upcomingIncomes.length > 0 ? (
          <InsightChip
            tone="#34D399"
            icon={<Wallet className="size-3" />}
            label={`${upcomingIncomes.length} הכנסות צפויות`}
          />
        ) : null}
        {firstPressureDay !== null ? (
          <InsightChip
            tone="#F59E0B"
            icon={<CalendarRange className="size-3" />}
            label={
              firstPressureDay === 0
                ? "לחץ צפוי כבר היום"
                : `לחץ צפוי בעוד ${firstPressureDay} ימים`
            }
          />
        ) : (
          <InsightChip
            tone="#34D399"
            icon={<ShieldCheck className="size-3" />}
            label={`${status.daysSafe} ימים בטוחים`}
          />
        )}
      </div>

      <AnimatePresence initial={false}>
        {selectedPoint ? (
          <motion.div
            key={`detail-${selectedDay}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <SelectedDayPanel
              point={selectedPoint}
              onClose={() => setSelectedDay(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
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
    </div>
  );
}

function FilterRow({
  value,
  onChange,
}: {
  value: FilterKind;
  onChange: (next: FilterKind) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="סינון לפי סוג"
    >
      {FILTERS.map((opt) => {
        const active = value === opt.value;
        const tone =
          opt.value === "all"
            ? "#E5E7EB"
            : TONE[opt.value as LiquidityEvent["kind"]];
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
              active
                ? ""
                : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
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

function Sparkline({
  points,
  path,
  filter,
  selectedDay,
  onSelectDay,
}: {
  points: LiquidityPoint[];
  path: ReturnType<typeof buildPath>;
  filter: FilterKind;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const dots = useMemo(() => {
    const out: Array<{
      day: number;
      kind: LiquidityEvent["kind"];
      amount: number;
      x: number;
      y: number;
    }> = [];
    for (let day = 0; day < points.length; day++) {
      const x = path.xs[day];
      const y = path.ys[day];
      for (const ev of points[day].events) {
        out.push({ day, kind: ev.kind, amount: ev.amount, x, y });
      }
    }
    return out;
  }, [points, path]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2">
      <svg
        viewBox={`0 0 ${path.w} ${path.h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="תחזית תזרים"
        className="block h-32 w-full"
      >
        {/* Danger zone shading */}
        {path.zeroY !== null ? (
          <rect
            x={0}
            y={path.zeroY}
            width={path.w}
            height={path.h - path.zeroY}
            fill="rgba(248,113,113,0.08)"
          />
        ) : null}
        {/* Zero line */}
        {path.zeroY !== null ? (
          <line
            x1={0}
            y1={path.zeroY}
            x2={path.w}
            y2={path.zeroY}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="2 4"
          />
        ) : null}
        {/* Today marker */}
        <line
          x1={path.xs[0]}
          y1={0}
          x2={path.xs[0]}
          y2={path.h}
          stroke="rgba(255,255,255,0.16)"
          strokeDasharray="2 2"
        />
        {/* Fill + curve animated */}
        <motion.path
          initial={false}
          animate={{ d: path.fill }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          fill="rgba(0,229,255,0.10)"
        />
        <motion.path
          initial={false}
          animate={{ d: path.line }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          stroke="var(--neon)"
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Event dots */}
        {dots.map((d, i) => {
          const isMatch = filter === "all" || d.kind === filter;
          const isSelected = selectedDay === d.day;
          const tone = TONE[d.kind];
          const r = Math.min(
            6,
            2 + Math.log10(Math.max(10, Math.abs(d.amount))),
          );
          return (
            <g key={`dot-${i}`} opacity={isMatch ? 1 : 0.2}>
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

function InsightChip({
  tone,
  icon,
  label,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
      style={{
        color: tone,
        borderColor: `${tone}44`,
        background: `${tone}10`,
      }}
    >
      {icon}
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
        <span className="text-[12px] font-medium text-foreground">
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
          אין אירועים מתועדים ביום הזה.
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
        ) : (
          <span />
        )}
        {expense > 0 ? (
          <span dir="ltr" data-mono="true" className="text-[#F87171]">
            −{ILS.format(Math.round(expense))}
          </span>
        ) : (
          <span />
        )}
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

function buildPath(points: LiquidityPoint[]) {
  if (points.length === 0) {
    return {
      line: "",
      fill: "",
      w: 100,
      h: 60,
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
  const zeroY = min < 0 && max > 0 ? scaleY(0) : null;
  return { line, fill, w, h, zeroY, xs, ys };
}

function filterEvents(
  points: LiquidityPoint[],
  filter: FilterKind,
): LiquidityPoint[] {
  if (filter === "all") return points;
  return points.map((p) => ({
    ...p,
    events: p.events.filter((e) => e.kind === filter),
  }));
}
