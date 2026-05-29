"use client";

// Phase 218 — anchor trajectory sparkline.
// Phase 293 — now a forward-looking projected balance path.
//
// Earlier this card only plotted historical anchor snapshots from
// localStorage and went blank until the user logged 2+ updates.
// In practice that made the section feel disconnected from the rest
// of the future-forecast intelligence. It now uses the same
// liquidityCurve() engine the LiquidityCurveCard uses to draw the
// projected journey forward from today, layered with a "safety
// floor" the user can dial in via three modes: רגיל / זהיר / חירום.
// Each mode shifts the danger threshold and recomputes the dynamic
// state badge (stable / under pressure / risk).

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Banknote,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
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

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

type Mode = "normal" | "careful" | "emergency";

const MODES: Array<{ key: Mode; label: string; floorMultiplier: number }> = [
  { key: "normal", label: "מסלול רגיל", floorMultiplier: 0 },
  { key: "careful", label: "מצב זהיר", floorMultiplier: 0.5 },
  { key: "emergency", label: "מצב חירום", floorMultiplier: 1.0 },
];

export function AnchorTrajectoryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("normal");

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

  if (!hydrated) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors || !curve || curve.points.length < 2) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Activity />} title="מסלול יתרת בנק" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="עוד אין מסלול לצייר"
          reason="המסלול נבנה מהיתרה הנוכחית + הכנסות וחיובים צפויים. הוסף לפחות חשבון בנק עם יתרה כדי שתופיע תחזית."
          unlockHint="הגדרות → חשבונות → הוסף חשבון בנק עם יתרה נוכחית."
        />
      </section>
    );
  }

  const points = curve.points;
  const start = points[0].balance;
  const end = points[points.length - 1].balance;
  const lowest = curve.lowestPoint.balance;
  const delta = end - start;

  // Phase 293 — safety floor scales with the user-picked mode.
  // "normal" = 0 (zero is the only danger line),
  // "careful" = half of avg monthly inflow as a buffer cushion,
  // "emergency" = full month of inflow as a buffer cushion.
  const monthlyInflow = curve.totalInflow / Math.max(1, curve.windowDays / 30);
  const modeMeta = MODES.find((m) => m.key === mode) ?? MODES[0];
  const safetyFloor = Math.round(monthlyInflow * modeMeta.floorMultiplier);

  const breachIdx = points.findIndex((p) => p.balance < safetyFloor);
  const breachDay = breachIdx >= 0 ? breachIdx : null;
  const stabilizesIdx = (() => {
    if (breachIdx < 0) return null;
    for (let i = breachIdx; i < points.length; i++) {
      if (points[i].balance >= safetyFloor) return i;
    }
    return null;
  })();

  const state = pickState({
    breachDay,
    stabilizesAt: stabilizesIdx,
    lowestBalance: lowest,
    safetyFloor,
    endBalance: end,
  });

  const tone = state.tone;
  const path = buildPath(
    points.map((p) => p.balance),
    safetyFloor,
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <SectionHeader icon={<Activity />} title="מסלול יתרת בנק" />

      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="מצב הקצה של המסלול"
      >
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                tap();
                setMode(m.key);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                active
                  ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_55%,transparent)]"
                  : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div
        className="flex items-start gap-2 rounded-2xl border px-3 py-2"
        style={{
          background: `${tone}10`,
          borderColor: `${tone}33`,
        }}
      >
        <span
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${tone}22`, color: tone }}
        >
          {state.icon}
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[12px] font-medium text-foreground">
            {state.headline}
          </span>
          {state.detail ? (
            <span className="text-[10px] text-muted-foreground/85">
              {state.detail}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="היום"
          value={signed(start)}
          sub={DAY_FMT.format(new Date(points[0].whenISO))}
        />
        <Stat
          label="נקודה נמוכה"
          value={signed(lowest)}
          sub={`יום ${curve.lowestPoint.dayIndex}`}
          tone={lowest < safetyFloor ? "neg" : "pos"}
        />
        <Stat
          label="סוף תחזית"
          value={signed(end)}
          tone={delta < 0 ? "neg" : "pos"}
          sub={DAY_FMT.format(new Date(points[points.length - 1].whenISO))}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2">
        <svg
          viewBox={`0 0 ${path.w} ${path.h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="מסלול יתרת בנק צפויה"
          className="block h-28 w-full"
        >
          {/* Safety-floor shading */}
          {path.floorY !== null ? (
            <>
              <rect
                x={0}
                y={path.floorY}
                width={path.w}
                height={path.h - path.floorY}
                fill={`${tone}10`}
              />
              <line
                x1={0}
                y1={path.floorY}
                x2={path.w}
                y2={path.floorY}
                stroke={`${tone}88`}
                strokeDasharray="3 4"
              />
            </>
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
          <motion.path
            initial={false}
            animate={{ d: path.fill }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            fill={`${tone}22`}
          />
          <motion.path
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ d: path.line, ...(reduced ? {} : { pathLength: 1 }) }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            stroke={tone}
            strokeWidth={1.8}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Breach + stabilization checkpoints */}
          {breachDay !== null ? (
            <CheckpointDot
              x={path.xs[breachDay]}
              y={path.ys[breachDay]}
              color="#F87171"
            />
          ) : null}
          {stabilizesIdx !== null ? (
            <CheckpointDot
              x={path.xs[stabilizesIdx]}
              y={path.ys[stabilizesIdx]}
              color="#34D399"
            />
          ) : null}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          רצפת ביטחון{" "}
          <span data-mono="true" dir="ltr">
            {ILS.format(Math.max(0, safetyFloor))}
          </span>
        </span>
        <span>{curve.windowDays} ימים קדימה</span>
      </div>
    </motion.section>
  );
}

function CheckpointDot({
  x,
  y,
  color,
}: {
  x: number;
  y: number;
  color: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill={`${color}33`} />
      <circle cx={x} cy={y} r={3.5} fill={color} stroke="#0A0A0A" strokeWidth={1} />
    </g>
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
  const color =
    tone === "neg" ? "#F87171" : tone === "pos" ? "#34D399" : undefined;
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12.5px] font-medium text-foreground"
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

function buildPath(values: number[], safetyFloor: number) {
  const w = 600;
  const h = 110;
  const min = Math.min(...values, 0, safetyFloor);
  const max = Math.max(...values, 0, safetyFloor);
  const span = max - min || 1;
  const scaleX = (i: number) =>
    values.length > 1 ? (i / (values.length - 1)) * w : w / 2;
  const scaleY = (v: number) => h - ((v - min) / span) * h;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i++) {
    xs.push(scaleX(i));
    ys.push(scaleY(values[i]));
  }
  const segs = values.map(
    (v, i) =>
      `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`,
  );
  const line = segs.join(" ");
  const fill = `${line} L${scaleX(values.length - 1).toFixed(1)} ${h} L${scaleX(0).toFixed(1)} ${h} Z`;
  const zeroY = min < 0 && max > 0 ? scaleY(0) : null;
  const floorY = safetyFloor > 0 ? scaleY(safetyFloor) : null;
  return { w, h, line, fill, zeroY, xs, ys, floorY };
}

type State = {
  tone: string;
  icon: React.ReactNode;
  headline: string;
  detail?: string;
};

function pickState(args: {
  breachDay: number | null;
  stabilizesAt: number | null;
  lowestBalance: number;
  safetyFloor: number;
  endBalance: number;
}): State {
  const { breachDay, stabilizesAt, lowestBalance, safetyFloor, endBalance } =
    args;

  if (breachDay === null) {
    // Never crosses the floor.
    if (endBalance > safetyFloor + 1000) {
      return {
        tone: "#34D399",
        icon: <TrendingUp className="size-3" />,
        headline: "המסלול צפוי להישאר יציב",
        detail: "היתרה נשארת מעל רצפת הביטחון לאורך כל החלון.",
      };
    }
    return {
      tone: "#60A5FA",
      icon: <ShieldCheck className="size-3" />,
      headline: "המסלול תחת שליטה",
      detail: "אין הפרה צפויה של רצפת הביטחון.",
    };
  }

  if (stabilizesAt !== null) {
    const span = stabilizesAt - breachDay;
    return {
      tone: "#F59E0B",
      icon: <AlertTriangle className="size-3" />,
      headline: `לחץ תזרימי צפוי בעוד ${breachDay} ימים`,
      detail: `היתרה נשארת מתחת לרצפת הביטחון כ-${Math.max(1, span)} ימים, ואז מתאוששת.`,
    };
  }

  return {
    tone: "#F87171",
    icon: <AlertTriangle className="size-3" />,
    headline: `סיכון לחציית רצפת הביטחון בעוד ${breachDay} ימים`,
    detail: `הנקודה הנמוכה הצפויה: ${ILS.format(Math.round(lowestBalance))}.`,
  };
}
