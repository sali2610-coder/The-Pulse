"use client";

// 6-month savings-rate trend. Bars per month with rate %, plus a
// headline average. Different from NetWorthCard (balance-based)
// — this surfaces FLOW. Auto-hides when there's nothing
// meaningful to show (no income + no outflow across the window).

import { useMemo } from "react";
import { motion } from "framer-motion";
import { PiggyBank } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { savingsRateTimeline } from "@/lib/savings-rate";
import { currentMonthKey } from "@/lib/dates";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const HORIZON = 6;

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "short",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${p > 0 ? "+" : ""}${Math.round(p * 100)}%`;
}

export function SavingsRateCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const tl = useMemo(() => {
    if (!hydrated) return null;
    return savingsRateTimeline({
      rules,
      loans,
      incomes,
      entries,
      statuses,
      endMonth: currentMonthKey(),
      months: HORIZON,
    });
  }, [hydrated, rules, loans, incomes, entries, statuses]);

  if (!hydrated || !tl) return null;
  const meaningful = tl.points.some((p) => p.income > 0 || p.outflow > 0);
  if (!meaningful) return null;

  // Scale bar widths to the max ABS finite rate in the window.
  const maxAbs = tl.points.reduce(
    (m, p) => (Number.isFinite(p.rate) ? Math.max(m, Math.abs(p.rate)) : m),
    0.2, // floor so a flat 0% month still gets a visible track
  );

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <PiggyBank className="size-3 text-[color:var(--neon)]" />
          שיעור חיסכון · {HORIZON} חודשים
        </span>
        <span
          className="text-[10px] font-semibold"
          style={{
            color:
              tl.averageRate > 0
                ? "#34D399"
                : tl.averageRate < 0
                  ? "#F87171"
                  : "#A1A1AA",
          }}
        >
          ממוצע {fmtPct(tl.averageRate)}
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {tl.points.map((p, idx) => {
          const finite = Number.isFinite(p.rate);
          const pct = finite ? Math.round(p.rate * 100) : 0;
          const tone = !finite
            ? "#A1A1AA"
            : p.rate > 0
              ? "#34D399"
              : "#F87171";
          const width =
            finite && maxAbs > 0
              ? `${Math.min(100, (Math.abs(p.rate) / maxAbs) * 100)}%`
              : "0%";
          return (
            <motion.li
              key={p.monthKey}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.25,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="w-14 shrink-0 text-muted-foreground">
                {monthLabel(p.monthKey)}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 start-0 rounded-full"
                  style={{
                    width,
                    background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
                  }}
                />
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="w-10 shrink-0 text-end text-[11px]"
                style={{ color: tone }}
              >
                {finite ? `${pct > 0 ? "+" : ""}${pct}%` : "—"}
              </span>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        (הכנסה − הוצאה מצרפית) ÷ הכנסה. שלילי = חוסר תזרים, חיובי = שיעור חיסכון.
      </p>
    </section>
  );
}
