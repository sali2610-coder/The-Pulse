"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { addMonths, currentMonthKey } from "@/lib/dates";
import { actualUntilDay, projectMonth } from "@/lib/projections";
import { forecastMonthEnd, type Forecast } from "@/lib/forecast";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

type PulseStatus = "idle" | "green" | "yellow" | "red" | "over";

function statusOf(pct: number): PulseStatus {
  if (!Number.isFinite(pct) || pct <= 0) return "idle";
  if (pct >= 100) return "over";
  if (pct >= 90) return "red";
  if (pct >= 70) return "yellow";
  return "green";
}

const STATUS_COLOR: Record<PulseStatus, string> = {
  idle: "#3F3F46",
  green: "#34D399",
  yellow: "#FACC15",
  red: "#F87171",
  over: "#EF4444",
};

const STATUS_LABEL: Record<PulseStatus, string> = {
  idle: "—",
  green: "תחת השליטה",
  yellow: "להאט",
  red: "קרוב לגבול",
  over: "חריגה מהיעד",
};

const FORECAST_COLOR = "#D4AF37"; // brand gold — matches the "trend ahead" feel

type Props = {
  budget: number;
};

export function PulseBar({ budget }: Props) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const monthKey = currentMonthKey();
  const today = new Date();
  const currentDay = today.getDate();

  const {
    actual,
    projected,
    benchmark,
    forecast,
    status,
    currentPct,
    scaleMax,
  } = useMemo(() => {
    if (!hydrated) {
      return {
        actual: 0,
        projected: 0,
        benchmark: 0,
        forecast: null as Forecast | null,
        status: "idle" as PulseStatus,
        currentPct: 0,
        scaleMax: budget || 1,
      };
    }
    const proj = projectMonth({ entries, rules, statuses, monthKey });
    const benchmark = actualUntilDay({
      entries,
      monthKey: addMonths(monthKey, -1),
      day: currentDay,
    });
    const forecast = forecastMonthEnd({
      entries,
      rules,
      statuses,
      monthlyBudget: budget,
      monthKey,
    });
    const safeBudget = budget > 0 ? budget : 0;
    const currentPct = safeBudget > 0 ? (proj.actual / safeBudget) * 100 : 0;
    const scaleMax =
      Math.max(
        safeBudget,
        proj.actual,
        benchmark,
        proj.projected,
        forecast.projectedTotal,
        1,
      ) * 1.05;

    return {
      actual: proj.actual,
      projected: proj.projected,
      benchmark,
      forecast,
      status: statusOf(currentPct),
      currentPct,
      scaleMax,
    };
  }, [hydrated, entries, rules, statuses, monthKey, currentDay, budget]);

  const noBudget = !budget || budget <= 0;

  const fillPct = noBudget ? 0 : Math.min(100, (actual / scaleMax) * 100);
  const projectedPct = noBudget
    ? 0
    : Math.min(100, (projected / scaleMax) * 100);
  const budgetPct = noBudget ? 0 : Math.min(100, (budget / scaleMax) * 100);
  const benchmarkPct = noBudget
    ? 0
    : Math.min(100, (benchmark / scaleMax) * 100);
  const forecastPct =
    noBudget || !forecast
      ? 0
      : Math.min(100, (forecast.projectedTotal / scaleMax) * 100);

  const accent = STATUS_COLOR[status];
  const isOver = status === "over";
  const forecastBreaches =
    !!forecast && budget > 0 && forecast.projectedTotal > budget;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-2xl"
    >
      <AnimatePresence>
        {isOver ? (
          <motion.div
            key="danger-glow"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 50%, rgba(239,68,68,0.18), transparent 70%)",
            }}
          />
        ) : null}
      </AnimatePresence>

      <header className="relative flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            <motion.span
              animate={
                isOver
                  ? { scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }
                  : { scale: 1, opacity: 1 }
              }
              transition={{
                duration: 1.2,
                repeat: isOver ? Infinity : 0,
                ease: "easeInOut",
              }}
              className="inline-block size-2 rounded-full"
              style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
            />
            The Pulse
          </div>
          <motion.div
            key={actual}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            data-mono="true"
            className="mt-2 text-3xl font-light tracking-tight text-foreground"
            style={{ direction: "ltr" }}
          >
            {formatILS(actual)}
          </motion.div>
          <div className="text-xs text-muted-foreground">
            מתוך {formatILS(budget || 0)} · {STATUS_LABEL[status]}
          </div>
        </div>
        <div className="text-end">
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            צפי
          </div>
          <div
            data-mono="true"
            className="text-base text-foreground"
            style={{ direction: "ltr", color: accent }}
          >
            {formatILS(projected)}
          </div>
          {noBudget ? null : (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {currentPct.toFixed(0)}% מהיעד
            </div>
          )}
        </div>
      </header>

      <div className="relative mt-5 h-6 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
        {!noBudget ? (
          <>
            <motion.div
              aria-hidden
              className="absolute inset-y-0 right-0 rounded-full"
              animate={{ width: `${projectedPct}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 22 }}
              style={{
                background: `linear-gradient(90deg, ${accent}33, ${accent}11)`,
              }}
            />
            <motion.div
              aria-hidden
              className="absolute inset-y-0 right-0 rounded-full"
              animate={{ width: `${fillPct}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 18 }}
              style={{
                background: `linear-gradient(90deg, ${accent}, color-mix(in oklab, ${accent} 60%, white))`,
                boxShadow: `0 0 24px -4px ${accent}`,
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0"
              style={{ right: `${budgetPct}%` }}
            >
              <div
                className="h-full w-px"
                style={{ background: "rgba(255,255,255,0.6)" }}
              />
            </div>
            {benchmark > 0 ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0"
                style={{ right: `${benchmarkPct}%` }}
              >
                <div
                  className="h-full w-px opacity-50"
                  style={{
                    background:
                      "repeating-linear-gradient(0deg, rgba(255,255,255,0.7) 0 3px, transparent 3px 6px)",
                  }}
                />
              </div>
            ) : null}
            {forecast && forecast.projectedTotal > 0 ? (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0"
                animate={{ right: `${forecastPct}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 22 }}
              >
                <div
                  className="h-full w-[2px]"
                  style={{
                    background: forecastBreaches ? "#EF4444" : FORECAST_COLOR,
                    boxShadow: `0 0 8px ${forecastBreaches ? "#EF4444" : FORECAST_COLOR}`,
                  }}
                />
                <div
                  className="absolute -top-1.5 -translate-x-1/2 text-[9px]"
                  style={{
                    color: forecastBreaches ? "#EF4444" : FORECAST_COLOR,
                  }}
                >
                  ▼
                </div>
              </motion.div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            הגדר תקציב חודשי כדי לראות את ה־Pulse
          </div>
        )}
      </div>

      {!noBudget ? (
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <Legend dotStyle={{ background: accent }} label="בפועל" />
          <Legend
            dotStyle={{
              background: FORECAST_COLOR,
              boxShadow: `0 0 6px ${FORECAST_COLOR}`,
            }}
            label="תחזית"
          />
          <Legend
            dotStyle={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.6)",
            }}
            label={`יעד · ${formatILS(budget)}`}
          />
          <Legend
            dotStyle={{
              background: "transparent",
              border: "1px dashed rgba(255,255,255,0.6)",
            }}
            label={`חודש קודם · ${formatILS(benchmark)}`}
          />
        </div>
      ) : null}

      {!noBudget && forecast ? (
        <ForecastDetail forecast={forecast} budget={budget} accent={FORECAST_COLOR} />
      ) : null}
    </motion.section>
  );
}

function ForecastDetail({
  forecast,
  budget,
  accent,
}: {
  forecast: Forecast;
  budget: number;
  accent: string;
}) {
  const breaches = forecast.projectedTotal > budget;
  const overBy = breaches ? forecast.projectedTotal - budget : 0;
  const underBy = !breaches ? budget - forecast.projectedTotal : 0;

  const paceLabel = (() => {
    if (forecast.paceVsHistorical === null) return null;
    const pct = Math.round(forecast.paceVsHistorical);
    if (Math.abs(pct) < 5) return "בקצב היסטורי";
    if (pct > 0) return `מהיר ב־${pct}% מהממוצע`;
    return `איטי ב־${Math.abs(pct)}% מהממוצע`;
  })();

  const confidenceLabel = {
    low: "ביטחון נמוך · מוקדם בחודש",
    medium: "ביטחון בינוני",
    high: "ביטחון גבוה",
  }[forecast.confidence];

  return (
    <motion.div
      key={Math.round(forecast.projectedTotal)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 flex items-start gap-3 rounded-2xl border border-white/5 bg-black/30 p-3"
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: `${accent}1a`,
          color: breaches ? "#EF4444" : accent,
        }}
      >
        <TrendingUp className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            צפי לסוף חודש
          </span>
          <span
            data-mono="true"
            className="text-sm text-foreground"
            style={{
              direction: "ltr",
              color: breaches ? "#EF4444" : accent,
            }}
          >
            {new Intl.NumberFormat("he-IL", {
              style: "currency",
              currency: "ILS",
              maximumFractionDigits: 0,
            }).format(forecast.projectedTotal)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {breaches
            ? `חריגה צפויה של ${new Intl.NumberFormat("he-IL", {
                style: "currency",
                currency: "ILS",
                maximumFractionDigits: 0,
              }).format(overBy)}`
            : `נשארת מרווח של ${new Intl.NumberFormat("he-IL", {
                style: "currency",
                currency: "ILS",
                maximumFractionDigits: 0,
              }).format(underBy)}`}
          {forecast.breachDay
            ? ` · יעד יחצה ב־${forecast.breachDay} בחודש`
            : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/80">
          {paceLabel ? <span>{paceLabel}</span> : null}
          <span>·</span>
          <span>{confidenceLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}

function Legend({
  dotStyle,
  label,
}: {
  dotStyle: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-full" style={dotStyle} />
      {label}
    </span>
  );
}
