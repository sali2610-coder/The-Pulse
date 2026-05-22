"use client";

// Net-worth multi-month sparkline. Renders ONLY when there are at
// least 2 monthly snapshots (one point isn't a trend). Auto-
// populates from NetWorthCard's recordSnapshot effect, so the
// curve grows organically as the user uses the app over time.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, LineChart } from "lucide-react";

import { listSnapshots, type NetWorthSnapshot } from "@/lib/net-worth-history";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "short",
  year: "2-digit",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

const WIDTH = 320;
const HEIGHT = 70;
const PAD_X = 4;
const PAD_Y = 6;

function buildPath(points: NetWorthSnapshot[]): {
  d: string;
  fillD: string;
  dots: Array<{ x: number; y: number }>;
} {
  if (points.length === 0) {
    return { d: "", fillD: "", dots: [] };
  }
  const vals = points.map((p) => p.netWorth);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const step = points.length === 1 ? 0 : innerW / (points.length - 1);
  const dots = points.map((p, i) => ({
    x: PAD_X + step * i,
    y: PAD_Y + innerH * (1 - (p.netWorth - min) / span),
  }));
  const d = dots
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
    .join(" ");
  const fillD =
    points.length > 1
      ? `${d} L ${dots[dots.length - 1].x.toFixed(2)} ${(HEIGHT - PAD_Y).toFixed(
          2,
        )} L ${dots[0].x.toFixed(2)} ${(HEIGHT - PAD_Y).toFixed(2)} Z`
      : "";
  return { d, fillD, dots };
}

export function NetWorthTrendCard() {
  const [points, setPoints] = useState<NetWorthSnapshot[]>([]);

  useEffect(() => {
    // Defer the localStorage read past the SSR-hydration tick.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setPoints(listSnapshots());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { d, fillD, dots } = useMemo(() => buildPath(points), [points]);

  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.netWorth - first.netWorth;
  const positive = delta >= 0;
  const tone = positive ? "#34D399" : "#F87171";
  const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LineChart className="size-3 text-[color:var(--neon)]" />
          הון נטו לאורך זמן
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {monthLabel(first.monthKey)} → {monthLabel(last.monthKey)}
        </span>
      </header>

      <motion.svg
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        aria-label="גרף הון נטו"
      >
        {fillD ? (
          <path
            d={fillD}
            fill={`${tone}1f`}
            stroke="none"
          />
        ) : null}
        <path d={d} stroke={tone} strokeWidth={1.6} fill="none" />
        {dots.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === dots.length - 1 ? 3 : 1.5}
            fill={tone}
          />
        ))}
      </motion.svg>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            עכשיו
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[16px] font-semibold text-foreground"
          >
            {ILS.format(last.netWorth)}
          </span>
        </div>
        <div
          className="flex items-center gap-1 text-[11px]"
          dir="ltr"
          data-mono="true"
          style={{ color: tone }}
        >
          <DeltaIcon className="size-3.5" />
          {positive ? "+" : ""}
          {ILS.format(delta)}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        נתונים מקומיים בלבד · {points.length} חודשים שמורים
      </p>
    </section>
  );
}
