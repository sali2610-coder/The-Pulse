"use client";

// Phase 225 — Simple-mode hero card #1: "כמה נשאר לי לבזבז".
// Phase 325 — converted to compact Daily Budget Strip.
//
// Single thin horizontal pulse (~80px tall) directly under the Pulse
// hero. Reads:
//
//   right   — small label "אפשר להוציא היום"
//   center  — big remaining-today ILS + sub line "מתוך ₪X ליום"
//   left    — mini meter (today's progress against per-day envelope)
//
// All math from the same engines the rest of the dashboard uses:
//   autoBudget()    — אם המשתמש במצב Auto + יש anchor: cycleAvailable
//                     ו-daysRemaining.
//   dailyAllowance — fallback to the existing manual-budget engine.
//   todayPulse     — לקריאת spentToday (כולל pending) המשותפת.
//
// Tap → BottomSheet "איך חישבנו" explaining the calculation.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, ChevronLeft, AlertTriangle } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { autoBudget } from "@/lib/auto-budget";
import { dailyAllowance } from "@/lib/forecast";
import { todayPulse } from "@/lib/today-pulse";
import { monthKeyOf } from "@/lib/dates";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type StripState = "calm" | "watch" | "stress" | "gray";

const STATE_TONE: Record<StripState, { fg: string; glow: string }> = {
  calm: { fg: "#22D3EE", glow: "#22D3EE" },
  watch: { fg: "#F59E0B", glow: "#FBBF24" },
  stress: { fg: "#F87171", glow: "#F87171" },
  gray: { fg: "#A1A1AA", glow: "#52525B" },
};

type StripData = {
  /** ILS the user can still spend today without breaking the cycle. */
  remainingToday: number;
  /** Per-day cap = available / daysRemaining. */
  perDay: number;
  /** ILS already spent today. */
  spentToday: number;
  /** Days until next salary (or month end). */
  daysRemaining: number;
  /** Cycle horizon — total ILS the user can spend until that day. */
  cycleAvailable: number;
  /** Origin of the calculation, surfaced in the explain sheet. */
  source: "auto" | "manual";
  /** True when the engine couldn't compute (no anchors + no manual). */
  insufficient: boolean;
};

function buildStripData(args: {
  hydrated: boolean;
  accounts: ReturnType<typeof useFinanceStore.getState>["accounts"];
  loans: ReturnType<typeof useFinanceStore.getState>["loans"];
  incomes: ReturnType<typeof useFinanceStore.getState>["incomes"];
  entries: ReturnType<typeof useFinanceStore.getState>["entries"];
  rules: ReturnType<typeof useFinanceStore.getState>["rules"];
  statuses: ReturnType<typeof useFinanceStore.getState>["statuses"];
  monthlyBudget: number;
  budgetMode: "manual" | "auto";
  buffer: number;
}): StripData | null {
  if (!args.hydrated) return null;
  const monthKey = monthKeyOf(new Date());
  const pulse = todayPulse({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthlyBudget: args.monthlyBudget,
    incomes: args.incomes,
  });
  const spentToday = pulse.spentToday;

  // Auto + anchors → cycle-aware envelope. Manual or missing anchors
  // → fall back to dailyAllowance (monthly budget pro-rated).
  if (args.budgetMode === "auto") {
    const report = autoBudget({
      accounts: args.accounts,
      loans: args.loans,
      incomes: args.incomes,
      entries: args.entries,
      rules: args.rules,
      statuses: args.statuses,
      safetyBuffer: args.buffer,
    });
    if (!report.breakdown.hasAnchors) {
      return {
        remainingToday: 0,
        perDay: 0,
        spentToday,
        daysRemaining: report.daysRemaining,
        cycleAvailable: 0,
        source: "auto",
        insufficient: true,
      };
    }
    const cycleAvailable = Math.max(0, report.availableUntilCycleEnd);
    const perDay = cycleAvailable / Math.max(1, report.daysRemaining);
    const remainingToday = Math.max(0, perDay - spentToday);
    return {
      remainingToday,
      perDay,
      spentToday,
      daysRemaining: report.daysRemaining,
      cycleAvailable,
      source: "auto",
      insufficient: report.availableUntilCycleEnd <= 0,
    };
  }

  // Manual mode.
  if (args.monthlyBudget <= 0) {
    return {
      remainingToday: 0,
      perDay: 0,
      spentToday,
      daysRemaining: 0,
      cycleAvailable: 0,
      source: "manual",
      insufficient: true,
    };
  }
  const d = dailyAllowance({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthlyBudget: args.monthlyBudget,
    monthKey,
  });
  const perDay = Math.max(0, d.allowance);
  const remainingToday = Math.max(0, perDay - spentToday);
  return {
    remainingToday,
    perDay,
    spentToday,
    daysRemaining: d.daysRemaining,
    cycleAvailable: perDay * d.daysRemaining,
    source: "manual",
    insufficient: false,
  };
}

function pickState(d: StripData): StripState {
  if (d.insufficient) return "gray";
  if (d.perDay <= 0) return "gray";
  if (d.spentToday >= d.perDay) return "stress";
  const ratio = d.remainingToday / d.perDay;
  if (ratio < 0.3) return "watch";
  return "calm";
}

export function HeroSpendableCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);

  const [sheetOpen, setSheetOpen] = useState(false);

  const data = useMemo(
    () =>
      buildStripData({
        hydrated,
        accounts,
        loans,
        incomes,
        entries,
        rules,
        statuses,
        monthlyBudget,
        budgetMode,
        buffer,
      }),
    [
      hydrated,
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      budgetMode,
      buffer,
    ],
  );

  if (!hydrated || !data) return null;

  const state = pickState(data);
  const tone = STATE_TONE[state];
  const ratio =
    data.perDay > 0 ? Math.min(1, data.spentToday / data.perDay) : 0;

  const subtitle =
    state === "gray"
      ? "חסר מידע לחישוב מדויק"
      : state === "stress"
        ? "היום עדיף לא להוציא מעבר להכרחי"
        : `מתוך ${ILS.format(Math.round(data.perDay))} ליום`;

  return (
    <>
      <motion.section
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-black/45 to-white/[0.01] p-3 backdrop-blur-md"
        style={{
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 40px -32px ${tone.glow}99`,
        }}
        aria-label={`אפשר להוציא היום ${ILS.format(Math.round(data.remainingToday))}`}
      >
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setSheetOpen(true);
          }}
          aria-label="פתח פירוט תקציב יומי"
          className="flex w-full items-center gap-3 text-start focus-visible:outline-none"
        >
          {/* RIGHT — label + headline value */}
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              <Wallet className="size-3" />
              אפשר להוציא היום
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[26px] font-light leading-tight"
              style={{ color: tone.fg }}
            >
              <AnimatedCounter
                value={data.remainingToday}
                format={(v) => ILS.format(Math.round(v))}
              />
            </span>
            <span className="line-clamp-1 text-[10.5px] text-muted-foreground/85">
              {state === "stress" ? (
                <span className="inline-flex items-center gap-1 text-[#F87171]">
                  <AlertTriangle className="size-3" />
                  {subtitle}
                </span>
              ) : (
                subtitle
              )}
            </span>
          </div>

          {/* LEFT — mini meter */}
          <div className="flex w-[110px] shrink-0 flex-col items-end gap-1 leading-tight">
            <span
              data-mono="true"
              dir="ltr"
              className="text-[10.5px] text-muted-foreground/85"
            >
              {ILS.format(Math.round(data.spentToday))} היום
            </span>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}
              aria-hidden
            >
              <motion.div
                initial={false}
                animate={{ width: `${Math.max(2, ratio * 100)}%` }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${tone.fg}, ${tone.glow}88)`,
                  boxShadow: `0 0 10px ${tone.glow}66`,
                }}
              />
            </div>
            <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted-foreground/65">
              פירוט
              <ChevronLeft className="size-3" />
            </span>
          </div>
        </button>
      </motion.section>

      <ExplainSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        data={data}
        tone={tone}
      />
    </>
  );
}

function ExplainSheet({
  open,
  onOpenChange,
  data,
  tone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: StripData;
  tone: { fg: string; glow: string };
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="איך חישבנו">
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: `${tone.fg}1f`, color: tone.fg }}
          >
            <Wallet className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">תקציב יומי</span>
            <span className="text-caption text-muted-foreground">
              {data.source === "auto"
                ? "מחושב אוטומטית מהנזילות"
                : "מחושב מהתקציב הידני"}
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[18px] font-semibold"
          style={{ color: tone.fg }}
        >
          {ILS.format(Math.round(data.remainingToday))}
        </span>
      </header>

      {data.insufficient ? (
        <p className="rounded-2xl border border-white/10 bg-black/40 p-3 text-[11.5px] text-muted-foreground">
          חסר מידע לחישוב מדויק. הגדר חשבון בנק עם יתרה ב״חשבונות״
          או קבע תקציב חודשי ידני בלשונית הגדרות.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/20 p-3 text-[12px]">
        <Row
          label="תקציב פנוי עד המשכורת"
          value={ILS.format(Math.round(data.cycleAvailable))}
          tone="info"
        />
        <Row
          label="ימים עד המשכורת"
          value={String(data.daysRemaining)}
          tone="info"
        />
        <Row
          label="תקציב יומי ממוצע"
          value={ILS.format(Math.round(data.perDay))}
          tone="info"
        />
        <Row
          label="הוצאות שכבר יצאו היום"
          value={`−${ILS.format(Math.round(data.spentToday))}`}
          tone="negative"
        />
        <li
          className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5 text-[12.5px] font-medium"
          style={{ color: tone.fg }}
        >
          <span>כמה נשאר להיום</span>
          <span data-mono="true" dir="ltr">
            {ILS.format(Math.round(data.remainingToday))}
          </span>
        </li>
      </ul>
    </BottomSheet>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "negative";
}) {
  const color =
    tone === "negative" ? "#F87171" : "rgba(255,255,255,0.85)";
  return (
    <li className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span data-mono="true" dir="ltr" style={{ color }}>
        {value}
      </span>
    </li>
  );
}
