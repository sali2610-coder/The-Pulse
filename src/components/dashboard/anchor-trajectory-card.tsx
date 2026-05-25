"use client";

// Phase 218 — anchor trajectory sparkline.
//
// Reads the local anchor-history log + current store anchors. Draws
// a 30/90-day inline SVG of TOTAL bank balance over time so the
// user sees how it has actually moved (not just where it stands).
//
// Auto-hides until there are at least 2 distinct history points
// (otherwise the line is just a dot).

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, Banknote } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildAnchorTrajectory,
  readAnchorHistory,
  type TrajectoryPoint,
} from "@/lib/anchor-history";
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

type WindowChoice = 30 | 90;

export function AnchorTrajectoryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const [windowDays, setWindowDays] = useState<WindowChoice>(30);
  const reduced = useReducedMotion();

  // Read history on each render — it's localStorage, cheap. Memoise
  // the projection to avoid recomputing on unrelated re-renders.
  const trajectory = useMemo(() => {
    if (!hydrated) return [];
    return buildAnchorTrajectory({
      history: readAnchorHistory(),
      windowDays,
    });
  }, [hydrated, windowDays]);

  if (!hydrated) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) {
    return null;
  }

  // Auto-hide before we have enough data to draw anything meaningful.
  if (trajectory.length < 2) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Activity />} title="מסלול יתרת בנק" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="עוד אין מסלול לצייר"
          reason="המסלול מצויר מעדכוני יתרת בנק. לאחר 2–3 עדכונים יופיע גרף."
          unlockHint='עדכן יתרת בנק עכשיו דרך "הגדרות → חשבונות" או הכפתור על הכרטיס "כמה נשאר".'
        />
      </section>
    );
  }

  const first = trajectory[0].balance;
  const last = trajectory[trajectory.length - 1].balance;
  const delta = last - first;
  const tone = delta > 0 ? "#34D399" : delta < 0 ? "#F87171" : "#A1A1AA";
  const path = buildPath(trajectory);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <SectionHeader
        icon={<Activity />}
        title="מסלול יתרת בנק"
        trailing={
          <div className="flex rounded-full bg-white/8 p-0.5">
            {([30, 90] as WindowChoice[]).map((opt) => {
              const active = windowDays === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    tap();
                    setWindowDays(opt);
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] transition-colors ${
                    active
                      ? "bg-[color:var(--neon)]/30 text-[color:var(--neon)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={active}
                  aria-label={`${opt} ימים`}
                >
                  {opt}ימים
                </button>
              );
            })}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="התחלה"
          value={signed(first)}
          sub={DAY_FMT.format(new Date(trajectory[0].whenISO))}
        />
        <Stat
          label="עכשיו"
          value={signed(last)}
          sub={DAY_FMT.format(
            new Date(trajectory[trajectory.length - 1].whenISO),
          )}
        />
        <Stat label="שינוי" value={signed(delta)} tone={delta < 0 ? "neg" : "pos"} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2">
        <svg
          viewBox={`0 0 ${path.w} ${path.h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="מסלול יתרת בנק"
          className="block h-24 w-full"
        >
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
          <path d={path.fill} fill={`${tone}22`} />
          <motion.path
            d={path.line}
            stroke={tone}
            strokeWidth={1.8}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={reduced ? undefined : { pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </div>
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

function buildPath(points: TrajectoryPoint[]) {
  const w = 600;
  const h = 100;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const scaleX = (i: number) =>
    points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
  const scaleY = (v: number) => h - ((v - min) / span) * h;
  const segs = points.map(
    (p, i) =>
      `${i === 0 ? "M" : "L"}${scaleX(i).toFixed(1)} ${scaleY(p.balance).toFixed(1)}`,
  );
  const line = segs.join(" ");
  const fill = `${line} L${scaleX(points.length - 1).toFixed(1)} ${h} L${scaleX(0).toFixed(1)} ${h} Z`;
  const zeroY = min < 0 && max > 0 ? scaleY(0) : null;
  return { w, h, line, fill, zeroY };
}
