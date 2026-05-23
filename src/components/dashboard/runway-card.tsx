"use client";

// Cashflow runway + stress scenarios. Distinct from EmergencyFund
// (fixed-month target) — runway answers "at the current burn rate
// how many months does my cushion last", plus three stress
// scenarios: lose primary income, no income at all, outflow ×1.5.
// Auto-hides when there's no baseline outflow to compute against.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Hourglass, Skull, TrendingDown } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { runwayReport, type RunwayScenario } from "@/lib/runway";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

function fmtMonths(m: number): string {
  if (!Number.isFinite(m)) return "∞";
  if (m >= 24) return `${Math.round(m)}+ חודשים`;
  if (m >= 1) return `${m.toFixed(1)} חודשים`;
  return `${Math.round(m * 30)} ימים`;
}

function tone(m: number): string {
  if (!Number.isFinite(m)) return "#34D399";
  if (m >= 6) return "#34D399";
  if (m >= 3) return "#D4AF37";
  if (m >= 1) return "#F5A742";
  return "#F87171";
}

function Row({ s, delay }: { s: RunwayScenario; delay: number }) {
  const t = tone(s.monthsOfRunway);
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22, ease: EASE_OUT_EXPO }}
      className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[11px]"
    >
      <span className="text-foreground">{s.label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12px] font-semibold"
        style={{ color: t }}
      >
        {fmtMonths(s.monthsOfRunway)}
      </span>
    </motion.li>
  );
}

export function RunwayCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return runwayReport({ accounts, incomes, entries });
  }, [hydrated, accounts, incomes, entries]);

  if (!hydrated || !report) return null;
  if (report.baseline.monthlyOutflow === 0) return null;

  const baseT = tone(report.baseline.monthsOfRunway);

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Hourglass className="size-3 text-[color:var(--neon)]" />
          מרחב נשימה
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          תרחישי לחץ
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-white/8 bg-black/25 px-3 py-2.5">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {report.baseline.label}
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold"
            style={{ color: baseT }}
          >
            {fmtMonths(report.baseline.monthsOfRunway)}
          </span>
        </div>
        <div className="flex flex-col items-end text-[10.5px] text-muted-foreground" dir="ltr" data-mono="true">
          <span>{Math.round(report.baseline.monthlyInflow)} / mo in</span>
          <span style={{ color: "#F87171" }}>
            −{Math.round(report.baseline.monthlyOutflow)} / mo out
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <TrendingDown className="size-3" />
        תרחישים
      </div>

      <ul className="flex flex-col gap-1.5">
        {report.scenarios.map((s, idx) => (
          <Row key={s.id} s={s} delay={idx * STAGGER_TIGHT} />
        ))}
      </ul>

      <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
        <Skull className="size-3 text-destructive/70" />
        מתבסס על ממוצע 3 חודשים אחרונים + יתרות בנק חיוביות בלבד.
      </p>
    </section>
  );
}
