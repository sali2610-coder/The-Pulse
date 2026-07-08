"use client";

// Phase 304 — interactive category donut.
// Tap a slice / list row → select. Center text + the slice itself
// react: selected stroke widens, other slices fade. Center shows
// per-category stats (amount, percentage, transaction count, avg).
// Long-form drilldown still available via the explicit "פתח פירוט"
// button inside the center.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getCategoryBreakdown,
} from "@/lib/financial-engine";
import { addMonths, currentMonthKey } from "@/lib/dates";
import {
  CATEGORIES,
  getCategory,
  type CategoryId,
} from "@/lib/categories";
import type { MonthKey } from "@/types/finance";
import { CategoryDrilldownSheet } from "@/components/dashboard/category-drilldown-sheet";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const SIZE = 168;
const STROKE = 18;
const STROKE_SELECTED = 26;
const RADIUS = (SIZE - STROKE_SELECTED) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type PeriodKey = "this" | "prev" | "prev2";
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "this", label: "החודש" },
  { key: "prev", label: "חודש שעבר" },
  { key: "prev2", label: "לפני 2 חודשים" },
];

function monthKeyFor(p: PeriodKey): MonthKey {
  if (p === "this") return currentMonthKey();
  if (p === "prev") return addMonths(currentMonthKey(), -1);
  return addMonths(currentMonthKey(), -2);
}

export function CategoryDonut() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const [period, setPeriod] = useState<PeriodKey>("this");
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const [drilldown, setDrilldown] = useState<CategoryId | null>(null);
  const monthKey = monthKeyFor(period);

  const data = useMemo(() => {
    type Slice = {
      id: CategoryId;
      label: string;
      accent: string;
      amount: number;
      count: number;
      biggest: number;
    };
    if (!hydrated) {
      return { slices: [] as Slice[], total: 0, count: 0 };
    }
    // Phase 394 — single source of truth via FinancialEngine.
    // getCategoryBreakdown carries per-category count + biggest in
    // row.meta so the donut doesn't have to walk raw entries.
    const breakdown = getCategoryBreakdown(
      buildEngineCtx({
        accounts,
        rules,
        statuses,
        entries,
        loans,
        incomes,
        monthlyBudget,
        monthKey,
      }),
    );
    const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));
    const slices: Slice[] = breakdown.rows
      .filter((r) => r.category && r.amount > 0)
      .map((r) => {
        const id = r.category as CategoryId;
        const meta = getCategory(id);
        const m = r.meta ?? {};
        return {
          id,
          label: meta.label,
          accent: meta.accent,
          amount: r.amount,
          count: (m.count as number) ?? 0,
          biggest: (m.biggest as number) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99);
      });
    const total = breakdown.total;
    const count = slices.reduce((acc, s) => acc + s.count, 0);
    return { slices, total, count };
  }, [
    hydrated,
    accounts,
    entries,
    rules,
    statuses,
    loans,
    incomes,
    monthlyBudget,
    monthKey,
  ]);

  const arcs = useMemo(() => {
    if (data.total <= 0) return [];
    let acc = 0;
    return data.slices.map((s) => {
      const portion = s.amount / data.total;
      const length = portion * CIRCUMFERENCE;
      const arc = {
        ...s,
        length,
        offset: acc,
        portion,
      };
      acc += length;
      return arc;
    });
  }, [data]);

  const selectedAgg = selected
    ? data.slices.find((s) => s.id === selected) ?? null
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground/90">
          פילוח לפי קטגוריה
        </h3>
        <div className="flex gap-1.5" role="radiogroup" aria-label="טווח זמן">
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  hapticTap();
                  setPeriod(p.key);
                  setSelected(null);
                }}
                className={`rounded-full px-2.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                  active
                    ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)]"
                    : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="cd-donut-svg"
          >
            {/* Premium filters: outer glow + inner shadow → glass depth. */}
            <defs>
              <filter id="cd-slice-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="cd-inner-shadow" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
              </radialGradient>
            </defs>
            {/* Track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE}
              fill="none"
            />
            {arcs.map((a, idx) => {
              const isSelected = selected === a.id;
              const dim = selected !== null && !isSelected;
              return (
                <motion.circle
                  key={a.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke={a.accent}
                  fill="none"
                  strokeLinecap="butt"
                  filter={isSelected ? "url(#cd-slice-glow)" : undefined}
                  initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
                  animate={{
                    strokeDasharray: `${a.length} ${CIRCUMFERENCE - a.length}`,
                    strokeDashoffset: -a.offset,
                    strokeWidth: isSelected ? STROKE_SELECTED : STROKE,
                    opacity: dim ? 0.32 : 1,
                  }}
                  transition={{
                    delay: 0.15 + idx * 0.05,
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    transform: `rotate(-90deg)`,
                    transformOrigin: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    hapticTap();
                    if (selected === a.id) {
                      // Second tap on the already-selected slice opens
                      // the rich detail sheet (matches the Wallet /
                      // Copilot pattern).
                      setDrilldown(a.id);
                    } else {
                      setSelected(a.id);
                    }
                  }}
                  onDoubleClick={() => {
                    hapticTap();
                    setDrilldown(a.id);
                  }}
                />
              );
            })}
            {/* Inner shadow ring — added last so it sits above slices. */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS - STROKE / 2 - 1}
              fill="url(#cd-inner-shadow)"
              pointerEvents="none"
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {selectedAgg ? (
              <>
                <span
                  className="text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: selectedAgg.accent }}
                >
                  {selectedAgg.label}
                </span>
                <span
                  dir="ltr"
                  className="font-mono text-lg font-semibold text-foreground"
                >
                  {ILS.format(Math.round(selectedAgg.amount))}
                </span>
                <span className="text-[10px] text-muted-foreground/85">
                  {Math.round(
                    (selectedAgg.amount / Math.max(1, data.total)) * 100,
                  )}
                  % · {selectedAgg.count} פעולות
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  גדול: {ILS.format(Math.round(selectedAgg.biggest))}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  סך הכל
                </span>
                <span
                  dir="ltr"
                  className="font-mono text-xl font-semibold text-foreground"
                >
                  {ILS.format(data.total)}
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {data.count} פעולות
                </span>
              </>
            )}
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-1">
          {data.slices.slice(0, 5).map((s) => {
            const active = selected === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setSelected((cur) => (cur === s.id ? null : s.id));
                  }}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                    active ? "bg-white/8" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className="flex items-center gap-2"
                    style={{
                      color: active ? s.accent : "var(--foreground)",
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: s.accent }}
                    />
                    {s.label}
                  </span>
                  <span dir="ltr" className="font-mono text-foreground/70">
                    {ILS.format(s.amount)}
                  </span>
                </button>
              </li>
            );
          })}
          {data.slices.length === 0 && (
            <li className="text-xs text-muted-foreground">
              אין עדיין הוצאות בתקופה הזו.
            </li>
          )}
        </ul>
      </div>

      {selectedAgg ? (
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setDrilldown(selectedAgg.id);
          }}
          aria-label={`פתח פירוט עסקאות בקטגוריית ${selectedAgg.label}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
        >
          פתח פירוט עסקאות
          <ArrowLeft className="size-3" />
        </button>
      ) : null}

      {drilldown && (
        <CategoryDrilldownSheet
          key={`${drilldown}-${monthKey}`}
          open={Boolean(drilldown)}
          onOpenChange={(v) => {
            if (!v) setDrilldown(null);
          }}
          category={drilldown}
          monthKey={monthKey}
        />
      )}
    </motion.div>
  );
}
