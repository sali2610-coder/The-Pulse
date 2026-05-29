"use client";

// Phase 206 — TodayPulseCard.
// Phase 320 — renamed to "Pulse"; rebuilt as the app's emotional hero.
//
// One question this widget answers: how do I feel financially right
// now? Not numbers — feeling. The card shows:
//
//   • LEFT   — state badge + state name (calm / balanced / watch /
//              stress / recovery) with a tone-matched glow.
//   • CENTER — a slowly scrolling ECG-style waveform that breathes
//              with the state. Real timeline dots (expense / refund /
//              pending / income) overlay the wave at their hour.
//   • RIGHT  — daily impact meter: +/− ILS vs the daily envelope,
//              with a LOW / MEDIUM / HIGH band tag.
//   • BOTTOM — single dynamic insight sentence from the engine.
//
// Tap the card → BottomSheet with full day timeline + the day's
// driver events + a recommended next step.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Waves,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  todayPulse,
  type ImpactBand,
  type PulseState,
  type TimelineEvent,
} from "@/lib/today-pulse";
import {
  openAttentionCenter,
} from "@/lib/use-attention-center";
import { tap as hapticTap } from "@/lib/haptics";
import { BottomSheet } from "@/components/ui/bottom-sheet";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const STATE_TONE: Record<
  PulseState,
  { fg: string; glow: string; bg: string; label: string }
> = {
  calm: { fg: "#22D3EE", glow: "#22D3EE", bg: "#22D3EE1a", label: "רגוע" },
  balanced: {
    fg: "#60A5FA",
    glow: "#60A5FA",
    bg: "#60A5FA1a",
    label: "מאוזן",
  },
  watch: {
    fg: "#F59E0B",
    glow: "#FBBF24",
    bg: "#F59E0B1a",
    label: "זהירות",
  },
  stress: {
    fg: "#F87171",
    glow: "#F87171",
    bg: "#F871711a",
    label: "לחץ",
  },
  recovery: {
    fg: "#A78BFA",
    glow: "#A78BFA",
    bg: "#A78BFA1a",
    label: "התאוששות",
  },
};

const IMPACT_LABEL: Record<ImpactBand, string> = {
  low: "השפעה נמוכה",
  medium: "השפעה בינונית",
  high: "השפעה גבוהה",
};

// Wave geometry — two stacked tiles scroll left in tandem for a
// seamless loop. Generates an ECG-like path: gentle baseline drift
// with periodic small spikes whose density rises with the state.
const WAVE_W = 200;
const WAVE_H = 56;
const WAVE_MID = WAVE_H / 2;

function makeWavePath(intensity: number): string {
  // intensity: 0..1 — denser, taller spikes as state escalates.
  const points: Array<[number, number]> = [];
  const step = 4;
  const spikeEvery = 28 - Math.floor(intensity * 14); // 14..28
  let i = 0;
  for (let x = 0; x <= WAVE_W; x += step) {
    const y = WAVE_MID + Math.sin(x / 10) * 1.5;
    if (i % spikeEvery === 0 && x > 8 && x < WAVE_W - 8) {
      // QRS-style mini-spike (down-up-down).
      points.push([x, y]);
      points.push([x + 2, y + 6]);
      points.push([x + 4, y - 14 - intensity * 6]);
      points.push([x + 6, y + 4]);
      x += 6;
    } else {
      points.push([x, y]);
    }
    i += 1;
  }
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

function stateIntensity(state: PulseState): number {
  if (state === "stress") return 0.95;
  if (state === "watch") return 0.7;
  if (state === "balanced") return 0.45;
  if (state === "recovery") return 0.55;
  return 0.25;
}

function StateIcon({ state }: { state: PulseState }) {
  if (state === "stress")
    return <TrendingUp className="size-3.5" />;
  if (state === "watch") return <Activity className="size-3.5" />;
  if (state === "recovery")
    return <TrendingDown className="size-3.5" />;
  if (state === "calm") return <Waves className="size-3.5" />;
  return <Sparkles className="size-3.5" />;
}

export function TodayPulseCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const reduced = useReducedMotion();
  const [sheetOpen, setSheetOpen] = useState(false);

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

  if (!hydrated || !pulse) return null;

  const tone = STATE_TONE[pulse.state];
  const intensity = stateIntensity(pulse.state);
  const wavePath = makeWavePath(intensity);

  return (
    <>
      <motion.section
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-black/45 to-white/[0.01] p-3 backdrop-blur-md"
        style={{
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -42px ${tone.glow}99, inset 0 0 60px ${tone.glow}10`,
        }}
        aria-label={`Pulse — מצב ${tone.label}. ${pulse.dynamicInsight}`}
      >
        {/* Breathing glow — gentle radial pulse tied to state. */}
        {!reduced ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.45, 0.7, 0.45] }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              background: `radial-gradient(60% 80% at 50% 100%, ${tone.glow}22, transparent 70%)`,
            }}
          />
        ) : null}

        <button
          type="button"
          onClick={() => {
            hapticTap();
            setSheetOpen(true);
          }}
          aria-label="פתח Pulse — פירוט יומי"
          className="relative flex w-full flex-col gap-2 text-start focus-visible:outline-none"
        >
          <header className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <span
                className="inline-flex size-1.5 rounded-full"
                style={{
                  background: tone.fg,
                  boxShadow: `0 0 10px ${tone.glow}`,
                }}
              />
              Pulse
            </span>
            {pulse.pendingForReview > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  hapticTap();
                  openAttentionCenter();
                }}
                aria-label={`פתח מרכז תשומת הלב · ${pulse.pendingForReview} לאישור`}
                className="inline-flex items-center gap-1 rounded-full border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-2 py-0.5 text-[10px] font-medium text-[#FBBF24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 active:scale-95"
              >
                <Bell className="size-2.5" />
                {pulse.pendingForReview} לאישור
              </button>
            ) : null}
          </header>

          <div className="flex items-stretch gap-2">
            {/* LEFT — state badge */}
            <div className="flex w-[78px] shrink-0 flex-col items-start gap-1 leading-tight">
              <StateBadge state={pulse.state} tone={tone} />
              <span className="text-[11.5px] font-medium text-foreground">
                {tone.label}
              </span>
              <span className="text-[9.5px] text-muted-foreground/70">
                {pulse.countToday === 0
                  ? "אין חיובים היום"
                  : `${pulse.countToday} חיובים`}
              </span>
            </div>

            {/* CENTER — pulse wave + timeline overlay */}
            <div className="relative h-[56px] min-w-0 flex-1">
              <PulseWave
                wavePath={wavePath}
                tone={tone}
                reduced={!!reduced}
              />
              <TimelineDots events={pulse.timeline} tone={tone} />
              <HourScale />
            </div>

            {/* RIGHT — impact meter */}
            <div className="flex w-[68px] shrink-0 flex-col items-end gap-0.5 leading-tight">
              <ImpactValue impact={pulse.impact} tone={tone} />
              <span className="text-[9.5px] text-muted-foreground/70">
                {IMPACT_LABEL[pulse.impactBand]}
              </span>
              {pulse.paceRatio > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[9.5px]"
                  style={{
                    color:
                      pulse.paceRatio > 1.05
                        ? "#F87171"
                        : pulse.paceRatio < 0.95
                          ? "#34D399"
                          : "rgba(255,255,255,0.55)",
                  }}
                  dir="ltr"
                  data-mono="true"
                >
                  {pulse.paceRatio > 1 ? (
                    <ArrowUpRight className="size-2.5" />
                  ) : (
                    <ArrowDownRight className="size-2.5" />
                  )}
                  {Math.round(pulse.paceRatio * 100)}%
                </span>
              ) : null}
            </div>
          </div>

          {/* BOTTOM — dynamic insight */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="line-clamp-1 text-[11.5px] text-muted-foreground/90">
              {pulse.dynamicInsight}
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
              פירוט
              <ChevronLeft className="size-3" />
            </span>
          </div>
        </button>
      </motion.section>

      <PulseDaySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        pulse={pulse}
        tone={tone}
      />
    </>
  );
}

function StateBadge({
  state,
  tone,
}: {
  state: PulseState;
  tone: { fg: string; glow: string; bg: string; label: string };
}) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={state}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.25 }}
        className="inline-flex size-7 items-center justify-center rounded-xl"
        style={{
          background: tone.bg,
          color: tone.fg,
          boxShadow: `inset 0 0 0 1px ${tone.fg}33, 0 0 18px -4px ${tone.glow}cc`,
        }}
      >
        <StateIcon state={state} />
      </motion.span>
    </AnimatePresence>
  );
}

function PulseWave({
  wavePath,
  tone,
  reduced,
}: {
  wavePath: string;
  tone: { fg: string; glow: string };
  reduced: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
      className="absolute inset-0 size-full"
      role="img"
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="pulse-wave-grad" x1="0%" x2="100%">
          <stop offset="0%" stopColor={tone.fg} stopOpacity="0" />
          <stop offset="25%" stopColor={tone.fg} stopOpacity="0.85" />
          <stop offset="75%" stopColor={tone.glow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={tone.glow} stopOpacity="0" />
        </linearGradient>
        <filter
          id="pulse-wave-glow"
          x="-30%"
          y="-50%"
          width="160%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Baseline */}
      <line
        x1={0}
        x2={WAVE_W}
        y1={WAVE_MID}
        y2={WAVE_MID}
        stroke="#ffffff10"
        strokeWidth={1}
      />

      {/* Two tiles scrolling left for seamless loop. */}
      <motion.g
        animate={
          reduced
            ? { x: 0 }
            : {
                x: [0, -WAVE_W],
              }
        }
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        <path
          d={wavePath}
          stroke="url(#pulse-wave-grad)"
          strokeWidth={1.75}
          fill="none"
          filter="url(#pulse-wave-glow)"
        />
        <path
          d={wavePath}
          transform={`translate(${WAVE_W} 0)`}
          stroke="url(#pulse-wave-grad)"
          strokeWidth={1.75}
          fill="none"
          filter="url(#pulse-wave-glow)"
        />
      </motion.g>
    </svg>
  );
}

function TimelineDots({
  events,
  tone,
}: {
  events: TimelineEvent[];
  tone: { fg: string; glow: string };
}) {
  if (events.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      dir="ltr"
      aria-hidden
    >
      {events.map((ev, i) => {
        const left = `${Math.max(0, Math.min(100, (ev.hour / 24) * 100))}%`;
        const top =
          ev.kind === "income" ? "20%" : ev.kind === "refund" ? "30%" : "55%";
        const color =
          ev.kind === "income"
            ? "#34D399"
            : ev.kind === "refund"
              ? "#A78BFA"
              : ev.kind === "pending"
                ? "#FBBF24"
                : tone.fg;
        return (
          <motion.span
            key={`${ev.hour}-${ev.kind}-${i}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left,
              top,
              background: color,
              boxShadow: `0 0 8px ${color}cc`,
            }}
          />
        );
      })}
    </div>
  );
}

function HourScale() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 text-[8px] text-muted-foreground/55"
      dir="ltr"
      aria-hidden
    >
      <span>00</span>
      <span>06</span>
      <span>12</span>
      <span>18</span>
      <span>24</span>
    </div>
  );
}

function ImpactValue({
  impact,
  tone,
}: {
  impact: number;
  tone: { fg: string; glow: string };
}) {
  const rounded = Math.round(impact);
  const positive = rounded > 0;
  const color = positive ? "#34D399" : rounded < 0 ? "#F87171" : tone.fg;
  return (
    <span
      data-mono="true"
      dir="ltr"
      className="text-[18px] font-light leading-none"
      style={{ color }}
    >
      {positive ? "+" : rounded < 0 ? "−" : ""}
      {ILS.format(Math.abs(rounded))}
    </span>
  );
}

function PulseDaySheet({
  open,
  onOpenChange,
  pulse,
  tone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pulse: ReturnType<typeof todayPulse>;
  tone: { fg: string; glow: string; bg: string; label: string };
}) {
  const driverEvents = [...pulse.timeline].sort((a, b) => b.amount - a.amount);
  const action =
    pulse.state === "stress"
      ? "פעל עכשיו: דחה רכישה לא דחופה, או חכה למשכורת לפני חיוב גדול."
      : pulse.state === "watch"
        ? "האט במחצית השנייה של היום — תוותר על חיוב לא הכרחי אחד."
        : pulse.state === "recovery"
          ? "הזיכויים נטרלו את היום — מצב חוזר למסלול."
          : pulse.state === "calm"
            ? "אין לחץ — היום שלך מתחת לקצב הרגיל."
            : "הקצב יציב — שמור על אותה רמה.";

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Pulse — היום שלי">
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <Activity className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">
              מצב {tone.label}
            </span>
            <span className="text-caption" style={{ color: tone.fg }}>
              {pulse.dynamicInsight}
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[14px] font-medium"
          style={{
            color:
              pulse.impact > 0
                ? "#34D399"
                : pulse.impact < 0
                  ? "#F87171"
                  : tone.fg,
          }}
        >
          {pulse.impact > 0 ? "+" : pulse.impact < 0 ? "−" : ""}
          {ILS.format(Math.round(Math.abs(pulse.impact)))}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <SheetTile
          label="הוצא היום"
          value={ILS.format(Math.round(pulse.spentToday))}
          tone="#F87171"
        />
        <SheetTile
          label="מותר ליום"
          value={
            pulse.allowance > 0 ? ILS.format(Math.round(pulse.allowance)) : "—"
          }
          tone="#60A5FA"
        />
        <SheetTile
          label="קצב מול ממוצע"
          value={pulse.paceRatio > 0 ? `${Math.round(pulse.paceRatio * 100)}%` : "—"}
          tone={
            pulse.paceRatio > 1.05
              ? "#F87171"
              : pulse.paceRatio < 0.95
                ? "#34D399"
                : "#A1A1AA"
          }
          ltr
        />
      </div>

      {driverEvents.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-foreground">
            פעולות שהשפיעו על Pulse
          </span>
          <ul className="flex flex-col gap-1">
            {driverEvents.slice(0, 5).map((ev, i) => {
              const isIn = ev.kind === "income" || ev.kind === "refund";
              const color = isIn
                ? ev.kind === "income"
                  ? "#34D399"
                  : "#A78BFA"
                : ev.kind === "pending"
                  ? "#FBBF24"
                  : "#F87171";
              const label =
                ev.kind === "income"
                  ? "הכנסה"
                  : ev.kind === "refund"
                    ? "זיכוי"
                    : ev.kind === "pending"
                      ? "ממתין"
                      : "חיוב";
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 p-2.5 text-[12px] text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{
                        background: color,
                        boxShadow: `0 0 8px ${color}aa`,
                      }}
                    />
                    {label} · {String(ev.hour).padStart(2, "0")}:00
                  </span>
                  <span data-mono="true" dir="ltr" style={{ color }}>
                    {isIn ? "+" : "−"}
                    {ILS.format(Math.round(ev.amount))}
                  </span>
                </li>
              );
            })}
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

      {pulse.daysToNextIncome !== null ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Wallet className="size-3 text-[#34D399]" />
          {pulse.daysToNextIncome === 0
            ? "כניסת הכנסה צפויה היום."
            : pulse.daysToNextIncome === 1
              ? "כניסת הכנסה צפויה מחר."
              : `עוד ${pulse.daysToNextIncome} ימים למשכורת הבאה.`}
        </p>
      ) : null}
    </BottomSheet>
  );
}

function SheetTile({
  label,
  value,
  tone,
  ltr = true,
}: {
  label: string;
  value: string;
  tone: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir={ltr ? "ltr" : "rtl"}
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
