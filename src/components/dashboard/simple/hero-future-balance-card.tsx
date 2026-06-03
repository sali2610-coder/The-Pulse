"use client";

// Phase 228 + 241 — Simple-mode hero card: "מצב חשבון בנק בתאריך X".
//
// Answers the consumer question "what will my account look like on
// the Xth?" using the liquidity-curve engine.
//
// Phase 241 added the date-picker preset row:
//   * היום       → offset 0  (a sanity check vs. anchor)
//   * 1 לחודש    → days until the 1st of the next calendar month
//   * 10 לחודש   → days until the 10th of the next calendar month
//   * סוף החודש  → days until the last day of the current month
//   * מותאם      → free numeric input (clamped to window)
// The legacy −7 / +7 controls move under a single "כיוון" row so
// the picker doesn't overflow on small phones.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { FutureBalanceExplain } from "@/components/dashboard/simple/future-balance-explain";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { forecastHealthScore } from "@/lib/forecast-health";
import { PulseForecastGauge } from "@/components/dashboard/simple/pulse-forecast-gauge";
import { todayPulse } from "@/lib/today-pulse";
import { currentMonthKey } from "@/lib/dates";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function sameDay(a: string, b: Date): boolean {
  const ad = new Date(a);
  return (
    ad.getFullYear() === b.getFullYear() &&
    ad.getMonth() === b.getMonth() &&
    ad.getDate() === b.getDate()
  );
}

/** Days between today (00:00) and a target absolute date, inclusive
 *  of the target day. Negative when the target is in the past. */
function daysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Offset (days from today) to the Xth day of the next/current month
 *  whichever is still in the future. Falls back to next month when
 *  today is already past the target day of the current month. */
function offsetToDayOfMonth(now: Date, day: number): number {
  const thisMonthTarget = new Date(now.getFullYear(), now.getMonth(), day);
  if (thisMonthTarget.getTime() > now.getTime()) {
    return daysBetween(thisMonthTarget, now);
  }
  const nextMonthTarget = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return daysBetween(nextMonthTarget, now);
}

/** Last day of the current month as an offset from today. */
function offsetToEndOfMonth(now: Date): number {
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, daysBetween(eom, now));
}

/** Phase 342 — offset to the Nth day of the NEXT calendar month,
 *  regardless of where today sits. Distinct from offsetToDayOfMonth
 *  which auto-picks "this month" when the day is still ahead. */
function offsetToDayOfNextMonth(now: Date, day: number): number {
  const target = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return daysBetween(target, now);
}

export function HeroFutureBalanceCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  // Compute a 60-day window so the user can slide forward without
  // running off the end of a default 35-day curve.
  const curve = useMemo(() => {
    if (!hydrated) return null;
    return liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays: 60,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  // Default offset: next salary day inside the window, else +30.
  const defaultOffset = useMemo(() => {
    if (!curve) return 30;
    if (curve.nextSalaryAt) {
      const idx = curve.points.findIndex((p) =>
        sameDay(p.whenISO, new Date(curve.nextSalaryAt!)),
      );
      if (idx > 0) return idx;
    }
    return Math.min(30, curve.points.length - 1);
  }, [curve]);

  const [offset, setOffset] = useState<number | null>(null);
  // Phase 338 — "עכשיו" preset is NOT a forecast offset. When live
  // is true the card renders a Live Snapshot instead of curve math:
  // current bank balance + today's activity, no future events.
  const [live, setLive] = useState(false);
  // Phase 342 — track which preset is active so the headline title
  // can mirror the chip ("איפה אהיה ב-10 לחודש הבא", etc.). Custom
  // day-input uses "custom"; default-fallback uses null.
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);
  const activeOffset = offset ?? defaultOffset;

  // Phase 338 — Live Snapshot data. Computed unconditionally so the
  // values are ready the moment the user taps "עכשיו"; cost is
  // O(entries) and Zustand selectors already memoize the inputs.
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const snap = useMemo(() => {
    if (!hydrated) return null;
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
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);
  const pulse = useMemo(() => {
    if (!hydrated) return null;
    return todayPulse({
      entries,
      rules,
      statuses,
      monthlyBudget,
      incomes,
    });
  }, [hydrated, entries, rules, statuses, monthlyBudget, incomes]);

  if (!hydrated || !curve) return <Skeleton />;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
        <span className="text-micro text-muted-foreground">
          איפה הבנק יהיה בתאריך הקרוב
        </span>
        <span className="text-body text-muted-foreground/85">
          חסרה יתרה נוכחית. הגדרות → חשבונות → הוסף יתרת בנק.
        </span>
      </section>
    );
  }

  const minOffset = 1;
  const maxOffset = Math.max(1, curve.points.length - 1);
  const clamped = Math.min(maxOffset, Math.max(minOffset, activeOffset));
  const point = curve.points[clamped];

  // Sum the deltas between today (idx 0) and the chosen date.
  let inflows = 0;
  let outflows = 0;
  // Phase 259 — capture the salary boundary so the user can see
  // exactly where the balance jumped. Tracks the LAST salary day
  // inside the snapshot range + its balance right after the inflow.
  let lastSalaryISO: string | null = null;
  let lastSalaryAmount = 0;
  let balanceAfterLastSalary: number | null = null;
  for (let i = 1; i <= clamped; i++) {
    for (const ev of curve.points[i].events) {
      if (ev.amount > 0) inflows += ev.amount;
      else outflows += Math.abs(ev.amount);
      if (ev.kind === "income") {
        lastSalaryISO = ev.whenISO;
        lastSalaryAmount = ev.amount;
        balanceAfterLastSalary = curve.points[i].balance;
      }
    }
  }

  const balance = Math.round(point.balance);
  const negative = balance < 0;
  const tight = !negative && balance < 500;
  const tone: "ok" | "warn" | "danger" = negative
    ? "danger"
    : tight
      ? "warn"
      : "ok";
  const color =
    tone === "danger" ? "#F87171" : tone === "warn" ? "#F59E0B" : "#34D399";

  // ── Live Snapshot branch ───────────────────────────────────────
  if (live && snap && pulse) {
    const liveBalance = Math.round(snap.currentBalance);
    const liveNegative = liveBalance < 0;
    const liveColor = liveNegative ? "#F87171" : "#34D399";
    const todayInflows = Math.round(pulse.refundedToday);
    const todayOutflows = Math.round(pulse.spentToday);
    const monthOutflows = Math.round(snap.actualSpentThisMonth);

    return (
      <section
        className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-6"
        style={{
          background: `linear-gradient(135deg, ${liveColor}14 0%, transparent 60%)`,
        }}
        aria-label="איפה אני עכשיו"
      >
        <div className="flex items-baseline justify-between gap-2">
          <motion.span
            key="live-title"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="text-micro text-muted-foreground"
          >
            איפה אני עכשיו
          </motion.span>
          <span className="text-caption text-muted-foreground" dir="rtl">
            {DAY_FMT.format(new Date())}
          </span>
        </div>

        <span
          data-mono="true"
          dir="ltr"
          className="text-hero"
          style={{ color: liveColor }}
        >
          {liveNegative ? "−" : ""}
          {ILS.format(Math.abs(liveBalance))}
        </span>

        <span className="text-caption text-muted-foreground/85">
          מצב חשבון חי לפי הנתונים שכבר נרשמו
        </span>

        <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
          <span>
            נכנס היום{" "}
            <span data-mono="true" dir="ltr" className="text-[#34D399]">
              +{ILS.format(todayInflows)}
            </span>
          </span>
          <span>
            יצא היום{" "}
            <span data-mono="true" dir="ltr" className="text-[#F87171]">
              −{ILS.format(todayOutflows)}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-caption text-muted-foreground">
          <span>
            סך יציאות החודש{" "}
            <span data-mono="true" dir="ltr" className="text-foreground">
              −{ILS.format(monthOutflows)}
            </span>
          </span>
          <span>
            פעולות היום ·{" "}
            <span data-mono="true" dir="ltr" className="text-foreground">
              {pulse.countToday}
            </span>
          </span>
        </div>

        <DatePicker
          clamped={clamped}
          defaultOffset={defaultOffset}
          minOffset={minOffset}
          maxOffset={maxOffset}
          live={live}
          activeKey={activePresetKey}
          onLive={() => {
            setLive(true);
            setActivePresetKey("live");
          }}
          onPick={(v, key) => {
            setLive(false);
            setOffset(v);
            setActivePresetKey(key);
          }}
        />
      </section>
    );
  }

  return (
    <section
      className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-6"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="איפה הבנק יהיה בתאריך הקרוב"
    >
      <div className="flex items-baseline justify-between gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={activePresetKey ?? "default"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="text-micro text-muted-foreground"
          >
            {forecastTitleFor(activePresetKey)}
          </motion.span>
        </AnimatePresence>
        <span className="text-caption text-muted-foreground" dir="rtl">
          {DAY_FMT.format(new Date(point.whenISO))}
        </span>
      </div>

      {/* Phase 346 — Pulse Forecast: headline + reactive mini gauge.
         The gauge sweeps the moment the user taps a chip, scoring
         the chosen target balance instead of the static "today"
         snapshot. Risk pill + reason line render beneath. */}
      {(() => {
        const health = forecastHealthScore({
          startingBalance: curve.startingBalance,
          projectedBalance: point.balance,
          daysAhead: clamped,
          deltaInflow: inflows,
          deltaOutflow: outflows,
        });
        return (
          <>
            <div className="flex items-end justify-between gap-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`${activePresetKey ?? "default"}|${balance}`}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}
                  data-mono="true"
                  dir="ltr"
                  className="text-hero"
                  style={{ color }}
                >
                  {negative ? "−" : ""}
                  {ILS.format(Math.abs(balance))}
                </motion.span>
              </AnimatePresence>
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="shrink-0"
              >
                <PulseForecastGauge score={health.score} band={health.band} />
              </motion.div>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={`risk|${activePresetKey ?? "default"}|${health.band}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start justify-between gap-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                  <span
                    className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em]"
                    style={{
                      color: bandTone(health.band),
                      background: `${bandTone(health.band)}1f`,
                      boxShadow: `inset 0 0 0 1px ${bandTone(health.band)}55`,
                    }}
                  >
                    {health.label}
                  </span>
                  <p className="line-clamp-2 text-[11.5px] text-muted-foreground/85">
                    {health.reason}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-caption text-muted-foreground">
                  <span>
                    הכנסות{" "}
                    <span data-mono="true" dir="ltr" className="text-[#34D399]">
                      +{ILS.format(Math.round(inflows))}
                    </span>
                  </span>
                  <span>
                    יציאות{" "}
                    <span data-mono="true" dir="ltr" className="text-[#F87171]">
                      −{ILS.format(Math.round(outflows))}
                    </span>
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </>
        );
      })()}

      {/* Phase 342 — salary banner only when the active selection is
         the "1 לחודש הבא" or "10 לחודש הבא" payday context, so the
         default view stays calm with just the two helper rows. */}
      {lastSalaryISO &&
      (activePresetKey === "first" ||
        activePresetKey === "next-month-10" ||
        activePresetKey === "next10") ? (
        <div
          className="flex items-baseline justify-between gap-2 rounded-2xl border border-[#34D399]/30 bg-[#34D399]/8 px-3 py-2"
          aria-label="קפיצת משכורת"
        >
          <span className="text-caption text-muted-foreground">
            ב-{DAY_FMT.format(new Date(lastSalaryISO))} נכנסה משכורת{" "}
            <span data-mono="true" dir="ltr" className="text-[#34D399]">
              +{ILS.format(Math.round(lastSalaryAmount))}
            </span>
          </span>
          {balanceAfterLastSalary !== null ? (
            <span
              data-mono="true"
              dir="ltr"
              className="text-caption font-medium text-foreground"
            >
              ↦{" "}
              {balanceAfterLastSalary < 0 ? "−" : ""}
              {ILS.format(
                Math.abs(Math.round(balanceAfterLastSalary)),
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Phase 241 — preset date row + custom day-of-month. */}
      <DatePicker
        clamped={clamped}
        defaultOffset={defaultOffset}
        minOffset={minOffset}
        maxOffset={maxOffset}
        live={live}
        activeKey={activePresetKey}
        onLive={() => {
          setLive(true);
          setActivePresetKey("live");
        }}
        onPick={(v, key) => {
          setLive(false);
          setOffset(v);
          setActivePresetKey(key);
        }}
      />

      {/* Phase 240 — transparent math breakdown. Collapsed by default. */}
      <FutureBalanceExplain offset={clamped} />
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
      <span className="text-micro text-muted-foreground">
        איפה הבנק יהיה בתאריך הקרוב
      </span>
      <span className="h-14 w-44 animate-pulse rounded bg-white/5" />
    </section>
  );
}

type PresetKey = "live" | "next10" | "eom" | "first" | "next-month-10" | "custom";

// Phase 346 — band → hex for the risk pill + gauge glow.
function bandTone(band: "safe" | "watch" | "tight" | "danger"): string {
  if (band === "safe") return "#34D399";
  if (band === "watch") return "#60A5FA";
  if (band === "tight") return "#F59E0B";
  return "#F87171";
}

// Phase 342 — title mirrors the active chip. Default falls back to
// the generic forecast prompt for the initial render.
function forecastTitleFor(key: string | null): string {
  switch (key) {
    case "next10":
      return "איפה אהיה ב-10 הקרוב";
    case "eom":
      return "איפה אהיה בסוף החודש";
    case "first":
      return "איפה אהיה ב-2 לחודש הבא";
    case "next-month-10":
      return "איפה אהיה ב-10 לחודש הבא";
    case "custom":
      return "איפה אהיה בתאריך מותאם";
    default:
      return "איפה אהיה בתאריך";
  }
}

type PresetMeta = {
  key: PresetKey;
  label: string;
  icon: LucideIcon;
  offset?: number; // undefined for live + custom (handled separately)
};

function DatePicker({
  clamped,
  defaultOffset,
  minOffset,
  maxOffset,
  live,
  activeKey,
  onLive,
  onPick,
}: {
  clamped: number;
  defaultOffset: number;
  minOffset: number;
  maxOffset: number;
  live: boolean;
  activeKey: string | null;
  onLive: () => void;
  onPick: (offset: number, key: PresetKey) => void;
}) {
  void defaultOffset;
  const [customOpen, setCustomOpen] = useState(false);
  const [customDay, setCustomDay] = useState<string>("");

  const now = new Date();
  // Phase 342 — reorder per spec: עכשיו → 10 הקרוב → סוף החודש →
  // 1 לחודש הבא → 10 לחודש הבא → מותאם. Tagged with a Lucide icon
  // each so the chip row reads like a wallet ribbon, not a filter.
  const presets: PresetMeta[] = [
    { key: "live", label: "עכשיו", icon: Zap },
    {
      key: "next10",
      label: "10 הקרוב",
      icon: CalendarDays,
      offset: offsetToDayOfMonth(now, 10),
    },
    {
      key: "eom",
      label: "סוף החודש",
      icon: Flag,
      offset: offsetToEndOfMonth(now),
    },
    {
      // Phase 343 — moved from day-1 to day-2. The 1st of the month
      // is salary-only; credit card settlements + many recurring
      // direct debits land on the 2nd, so the forecast for "פוסט-
      // משכורת" reads more accurately when anchored on day 2.
      key: "first",
      label: "2 לחודש הבא",
      icon: Briefcase,
      offset: offsetToDayOfNextMonth(now, 2),
    },
    {
      key: "next-month-10",
      label: "10 לחודש הבא",
      icon: Sparkles,
      offset: offsetToDayOfNextMonth(now, 10),
    },
    { key: "custom", label: "מותאם", icon: Target },
  ];

  function applyCustom() {
    const n = Number(customDay.trim());
    if (!Number.isFinite(n) || n < 1 || n > 31) return;
    const off = offsetToDayOfMonth(now, n);
    if (off < minOffset || off > maxOffset) return;
    hapticTap();
    onPick(off, "custom");
    setCustomOpen(false);
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* Premium chip ribbon. Horizontal scroll on tight screens so
         all 6 presets stay on one line; snap to each chip. */}
      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label="טווח זמן"
      >
        {presets.map((p) => {
          let active: boolean;
          if (p.key === "live") {
            active = live;
          } else if (p.key === "custom") {
            active = !live && activeKey === "custom";
          } else if (p.offset !== undefined) {
            const inRange = p.offset >= minOffset && p.offset <= maxOffset;
            if (!inRange) return null;
            active = !live && activeKey === p.key && clamped === p.offset;
          } else {
            return null;
          }

          const Icon = p.icon;
          const onClick = () => {
            hapticTap();
            if (p.key === "live") {
              onLive();
              setCustomOpen(false);
              return;
            }
            if (p.key === "custom") {
              setCustomOpen((v) => !v);
              return;
            }
            if (p.offset !== undefined) {
              onPick(p.offset, p.key);
              setCustomOpen(false);
            }
          };

          const accent =
            p.key === "live" ? "#22D3EE" : "var(--neon)";

          return (
            <motion.button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={
                p.key === "live"
                  ? "בחר תחזית לעכשיו"
                  : p.key === "custom"
                    ? "בחר תחזית לתאריך מותאם"
                    : `בחר תחזית ל-${p.label}`
              }
              data-no-min-tap
              onClick={onClick}
              whileTap={{ scale: 0.94 }}
              className="relative inline-flex shrink-0 snap-center items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
              style={{
                color: active ? accent : "rgba(255,255,255,0.75)",
              }}
            >
              {active ? (
                <motion.span
                  layoutId="hero-date-chip-pill"
                  className="absolute inset-0 -z-10 rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 55%, transparent), 0 0 18px -2px color-mix(in srgb, ${accent} 60%, transparent)`,
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/5"
                />
              )}
              <Icon className="size-3" />
              {p.label}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {customOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-2">
              <span className="text-caption text-muted-foreground">
                יום בחודש
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={customDay}
                onChange={(e) =>
                  setCustomDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="text-body h-10 w-16 rounded-md border border-white/12 bg-background/60 px-2 text-center text-foreground outline-none focus:border-[color:var(--neon)]/60"
                aria-label="יום בחודש"
                dir="ltr"
              />
              <button
                type="button"
                onClick={applyCustom}
                className="tap-44 text-body rounded-md bg-[color:var(--neon)]/20 px-3 py-2 text-[color:var(--neon)] hover:bg-[color:var(--neon)]/30"
              >
                החל
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* −7 / +7 — demoted to a small footer row. */}
      <div className="flex items-center justify-between gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onPick(Math.max(minOffset, clamped - 7), "custom");
          }}
          disabled={clamped <= minOffset || live}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-white/8 disabled:opacity-30"
          aria-label="הקדם בשבוע"
        >
          <ChevronRight className="size-3" />
          7-
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onPick(Math.min(maxOffset, clamped + 7), "custom");
          }}
          disabled={clamped >= maxOffset || live}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-white/8 disabled:opacity-30"
          aria-label="הוסף שבוע"
        >
          7+
          <ChevronLeft className="size-3" />
        </button>
      </div>
    </div>
  );
}
