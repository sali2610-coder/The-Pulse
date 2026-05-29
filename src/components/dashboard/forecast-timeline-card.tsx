"use client";

// Phase 201 — Forecast Timeline card.
// Phase 293 — live state header + range filter.
//
// Plain list of every upcoming financial event for the rest of the
// current month, sorted by day-of-month. Income inflows at top of
// each day, then outflows. Each row is a TimelineRow primitive so
// future timelines reuse the same shape.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  forecastTimeline,
  type ForecastEvent,
  type ForecastTimelineKind,
} from "@/lib/forecast-timeline";
import { SectionHeader } from "@/components/ui/section-header";
import { TimelineRow } from "@/components/ui/timeline-row";
import { CardEmpty } from "@/components/ui/card-empty";
import { listReveal } from "@/lib/motion-tokens";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ACCENT: Record<ForecastTimelineKind, string> = {
  salary: "#34D399",
  loan: "#F87171",
  recurring: "#60A5FA",
  card_slice: "#A78BFA",
  installment_plan: "#D4AF37",
};

const KIND_LABEL: Record<ForecastTimelineKind, string> = {
  salary: "הכנסה",
  loan: "הלוואה",
  recurring: "הוצאה קבועה",
  card_slice: "חיוב כרטיס",
  installment_plan: "פלאן תשלומים",
};

type RangeKey = "today" | "7d" | "14d" | "eom";

const RANGES: Array<{ key: RangeKey; label: string; days: number | "eom" }> = [
  { key: "today", label: "היום", days: 0 },
  { key: "7d", label: "7 ימים", days: 7 },
  { key: "14d", label: "14 ימים", days: 14 },
  { key: "eom", label: "סוף חודש", days: "eom" },
];

export function ForecastTimelineCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const [range, setRange] = useState<RangeKey>("7d");

  const events = useMemo(() => {
    if (!hydrated) return [];
    return forecastTimeline({ entries, rules, loans, incomes });
  }, [hydrated, entries, rules, loans, incomes]);

  const now = new Date();
  const today = now.getDate();
  const eomDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const horizonDays =
    range === "today" ? 0 :
    range === "7d" ? 7 :
    range === "14d" ? 14 :
    eomDay - today;

  const filtered = useMemo(() => {
    const cap = today + horizonDays;
    return events.filter((e) => e.day >= today && e.day <= cap);
  }, [events, today, horizonDays]);

  const insights = useMemo(
    () => buildInsights(filtered, today),
    [filtered, today],
  );

  if (!hydrated) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<CalendarClock />}
        title="ציר זמן צפוי החודש"
        trailing={
          filtered.length > 0 ? (
            <span
              className="text-[10px] text-muted-foreground/70"
              dir="ltr"
              aria-label={`${filtered.length} אירועים`}
            >
              {filtered.length}
            </span>
          ) : null
        }
      />

      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="טווח זמן"
      >
        {RANGES.map((r) => {
          const active = range === r.key;
          return (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                tap();
                setRange(r.key);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                active
                  ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_55%,transparent)]"
                  : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {insights.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {insights.map((ins) => (
            <li
              key={ins.id}
              className="flex items-start gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2"
            >
              <span
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${ins.tone}22`, color: ins.tone }}
              >
                {ins.icon}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[12px] font-medium text-foreground">
                  {ins.headline}
                </span>
                {ins.detail ? (
                  <span className="text-[10px] text-muted-foreground/85">
                    {ins.detail}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {filtered.length === 0 ? (
        <CardEmpty
          icon={<Sparkles className="size-4" />}
          title="אין אירועים בטווח שנבחר"
          reason="כל ההלוואות, ההכנסות והחיובים הקבועים שיצויינו עבור הטווח הזה כבר התרחשו."
          unlockHint="נסה טווח רחב יותר (14 ימים / סוף חודש) או הוסף הוצאה קבועה חדשה."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((e, idx) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={listReveal(idx)}
            >
              <TimelineRow
                day={e.day}
                label={e.label}
                amount={e.amount}
                meta={metaFor(e)}
                accent={ACCENT[e.kind]}
              />
            </motion.div>
          ))}
        </ul>
      )}
    </section>
  );
}

function metaFor(e: ForecastEvent): string {
  const prefix = KIND_LABEL[e.kind];
  if (e.meta) return `${prefix} · ${e.meta}`;
  return prefix;
}

type Insight = {
  id: string;
  tone: string;
  icon: React.ReactNode;
  headline: string;
  detail?: string;
};

function buildInsights(filtered: ForecastEvent[], today: number): Insight[] {
  if (filtered.length === 0) return [];
  const out: Insight[] = [];

  // 1. Next salary in range.
  const nextSalary = filtered.find((e) => e.kind === "salary");
  if (nextSalary) {
    const delta = nextSalary.day - today;
    const headline =
      delta === 0
        ? "המשכורת הבאה צפויה היום"
        : delta === 1
          ? "המשכורת הבאה צפויה מחר"
          : `המשכורת הבאה בעוד ${delta} ימים`;
    out.push({
      id: `salary-${nextSalary.id}`,
      tone: "#34D399",
      icon: <TrendingUp className="size-3" />,
      headline,
      detail: `${nextSalary.label} · ${ILS.format(Math.abs(nextSalary.amount))}`,
    });
  }

  // 2. Biggest outflow in range.
  const outflows = filtered.filter((e) => e.amount < 0);
  if (outflows.length > 0) {
    const biggest = outflows.reduce((acc, e) =>
      Math.abs(e.amount) > Math.abs(acc.amount) ? e : acc,
    );
    const delta = biggest.day - today;
    const when =
      delta === 0
        ? "היום"
        : delta === 1
          ? "מחר"
          : `בעוד ${delta} ימים`;
    out.push({
      id: `outflow-${biggest.id}`,
      tone: "#F87171",
      icon: <TrendingDown className="size-3" />,
      headline: `${when}: ${biggest.label} ${ILS.format(Math.abs(biggest.amount))}`,
      detail: `${KIND_LABEL[biggest.kind]} · החיוב הגדול ביותר בטווח`,
    });
  }

  // 3. Stabilization signal: if both salary AND outflows exist AND
  //    salary lands after the biggest outflow.
  if (
    nextSalary &&
    outflows.length > 0 &&
    nextSalary.day >
      outflows.reduce((a, e) =>
        Math.abs(e.amount) > Math.abs(a.amount) ? e : a,
      ).day
  ) {
    out.push({
      id: "stabilization",
      tone: "#60A5FA",
      icon: <ShieldCheck className="size-3" />,
      headline: "התזרים צפוי להתייצב לאחר כניסת המשכורת",
      detail: "החיובים הכבדים נופלים לפני יום ההכנסה — התקופה הזו זמנית.",
    });
  }

  return out.slice(0, 3);
}
