"use client";

// Phase 304 — interactive month heatmap.
// Each day cell is now a button. Tap → opens a bottom sheet with
// the day's breakdown: total spend, income (matched salary
// dayOfMonth), per-category list of charges, biggest expense.
// Heat color still maps to spend intensity. Smart day indicators
// surface salary / heavy-spend days at-a-glance.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { daysInMonth } from "@/lib/projections";
import { currentMonthKey, monthKeyOf } from "@/lib/dates";
import {
  buildEngineCtx,
  getMonthlyExpenses,
} from "@/lib/financial-engine";
import { getCategory } from "@/lib/categories";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type DayCell = {
  day: number;
  total: number;
  income: number;
  intensity: number;
  isFuture: boolean;
  hasSalary: boolean;
};

export function HeatmapMini() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthKey = currentMonthKey();

  // Phase 394 — engine-sourced per-day map. getMonthlyExpenses applies
  // the canonical filter (no refund, no FX, no pending, no withdrawal)
  // and carries chargeDate in row.meta so the heatmap groups straight
  // off the engine output.
  const expenseRows = useMemo(() => {
    if (!hydrated) return [] as ReturnType<typeof getMonthlyExpenses>["rows"];
    return getMonthlyExpenses(
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
    ).rows.filter((r) => r.kind === "entry");
  }, [
    hydrated,
    accounts,
    rules,
    statuses,
    entries,
    loans,
    incomes,
    monthlyBudget,
    monthKey,
  ]);

  const data = useMemo<{
    days: DayCell[];
    monthTotal: number;
    monthDays: number;
  }>(() => {
    if (!hydrated) return { days: [], monthTotal: 0, monthDays: 30 };
    const monthDays = daysInMonth(monthKey);
    const today = new Date();
    const todayMonth = monthKeyOf(today);
    const todayDay = todayMonth === monthKey ? today.getDate() : monthDays;

    const totals = new Array(monthDays).fill(0) as number[];
    for (const row of expenseRows) {
      const chargeAt = row.meta?.chargeDate as string | undefined;
      if (!chargeAt) continue;
      const d = new Date(chargeAt).getDate();
      if (d >= 1 && d <= monthDays) {
        totals[d - 1] += row.amount;
      }
    }
    const incomeByDay = new Array(monthDays).fill(0) as number[];
    const salaryDays = new Set<number>();
    for (const inc of incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      const d = Math.min(monthDays, Math.max(1, inc.dayOfMonth));
      incomeByDay[d - 1] += inc.amount;
      salaryDays.add(d);
    }
    const max = Math.max(...totals, 0);
    const monthTotal = totals.reduce((a, b) => a + b, 0);
    const days: DayCell[] = totals.map((total, i) => ({
      day: i + 1,
      total,
      income: incomeByDay[i],
      intensity: max > 0 ? Math.min(1, total / max) : 0,
      isFuture: i + 1 > todayDay,
      hasSalary: salaryDays.has(i + 1),
    }));
    return { days, monthTotal, monthDays };
  }, [hydrated, expenseRows, incomes, monthKey]);

  const dayEntries = useMemo(() => {
    if (selectedDay === null || !hydrated) return [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    const list: Array<{
      entry: import("@/types/finance").ExpenseEntry;
      amount: number;
    }> = [];
    for (const row of expenseRows) {
      const chargeAt = row.meta?.chargeDate as string | undefined;
      if (!chargeAt) continue;
      if (new Date(chargeAt).getDate() !== selectedDay) continue;
      const id = row.refId.replace(/^entry:/, "");
      const e = byId.get(id);
      if (!e) continue;
      list.push({ entry: e, amount: row.amount });
    }
    list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [selectedDay, expenseRows, entries, hydrated]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground/90">
          חום ימי החודש
        </h3>
        <span dir="ltr" className="font-mono text-xs text-muted-foreground">
          {ILS.format(data.monthTotal)}
        </span>
      </header>

      <div dir="ltr" className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => {
          const heavy = d.intensity >= 0.75;
          // Tone rules (Nav V3 audit):
          //   • future day       → neutral card, no fill.
          //   • income only      → green wash, brighter with amount.
          //   • expense only     → red wash, brighter with intensity.
          //   • both             → red→green diagonal gradient.
          //   • silent past      → very muted card so it reads as "0".
          const expenseTone = "#F87171";
          const incomeTone = "#34D399";
          let bg: string;
          let shadow = "none";
          if (d.isFuture) {
            bg = "rgba(255,255,255,0.035)";
          } else if (d.income > 0 && d.total > 0) {
            const intensityPct = Math.round(30 + d.intensity * 55);
            bg = `linear-gradient(135deg, color-mix(in oklab, ${expenseTone} ${intensityPct}%, transparent) 0%, color-mix(in oklab, ${incomeTone} 55%, transparent) 100%)`;
            shadow = `0 0 12px -4px color-mix(in oklab, ${expenseTone} 45%, transparent)`;
          } else if (d.income > 0) {
            bg = `color-mix(in oklab, ${incomeTone} 34%, transparent)`;
            shadow = `0 0 12px -4px color-mix(in oklab, ${incomeTone} 55%, transparent)`;
          } else if (d.intensity === 0) {
            bg = "rgba(255,255,255,0.05)";
          } else {
            const strength = Math.round(20 + d.intensity * 70);
            bg = `color-mix(in oklab, ${expenseTone} ${strength}%, transparent)`;
            shadow =
              d.intensity >= 0.6
                ? `0 0 14px -4px color-mix(in oklab, ${expenseTone} 60%, transparent)`
                : "none";
          }
          return (
            <motion.button
              type="button"
              key={d.day}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.18 + d.day * 0.008,
                type: "spring",
                stiffness: 280,
                damping: 22,
              }}
              onClick={() => {
                hapticTap();
                setSelectedDay(d.day);
              }}
              aria-label={`יום ${d.day} · ${ILS.format(d.total)}${d.hasSalary ? " · משכורת" : ""}`}
              className="hm-cell relative flex aspect-square items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
              style={{ background: bg, boxShadow: shadow }}
              title={`יום ${d.day} · ${ILS.format(d.total)}`}
            >
              <span className="text-[9px] font-medium text-foreground/70">
                {d.day}
              </span>
              {d.hasSalary ? (
                <Wallet
                  className="pointer-events-none absolute right-0.5 top-0.5 size-2 text-[#34D399]"
                  aria-hidden
                />
              ) : heavy ? (
                <AlertTriangle
                  className="pointer-events-none absolute right-0.5 top-0.5 size-2 text-[#F87171]"
                  aria-hidden
                />
              ) : null}
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>שקט</span>
        <div className="flex gap-1">
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((v) => (
            <span
              key={v}
              className="h-2 w-4 rounded-sm"
              style={{
                background: `color-mix(in oklab, var(--neon) ${Math.round(
                  18 + v * 72,
                )}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>סוער</span>
      </div>

      <DayDetailSheet
        open={selectedDay !== null}
        day={selectedDay}
        dayCell={
          selectedDay !== null
            ? data.days[selectedDay - 1] ?? null
            : null
        }
        entries={dayEntries}
        onOpenChange={(o) => {
          if (!o) setSelectedDay(null);
        }}
      />
    </motion.div>
  );
}

function DayDetailSheet({
  open,
  day,
  dayCell,
  entries,
  onOpenChange,
}: {
  open: boolean;
  day: number | null;
  dayCell: DayCell | null;
  entries: Array<{
    entry: import("@/types/finance").ExpenseEntry;
    amount: number;
  }>;
  onOpenChange: (open: boolean) => void;
}) {
  if (!day || !dayCell) {
    return <BottomSheet open={open} onOpenChange={onOpenChange} title="פירוט יום"><div /></BottomSheet>;
  }
  const categoriesUsed = Array.from(
    new Set(entries.map((e) => e.entry.category)),
  );
  const biggest = entries[0];
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={`פירוט יום ${day}`}>
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[color:var(--neon)]/15 text-[color:var(--neon)]">
            <CalendarRange className="size-4" />
          </span>
          <span className="text-section text-foreground">{`יום ${day} בחודש`}</span>
        </div>
        {dayCell.hasSalary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#34D399]/15 px-2 py-0.5 text-[10px] text-[#34D399]">
            <Wallet className="size-3" />
            משכורת ביום הזה
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-2">
        <DayStat
          icon={<Activity className="size-3.5" />}
          label="סך הוצאות"
          value={ILS.format(Math.round(dayCell.total))}
          tone={dayCell.total > 0 ? "#F87171" : "#A1A1AA"}
        />
        <DayStat
          icon={<Wallet className="size-3.5" />}
          label="סך הכנסות"
          value={ILS.format(Math.round(dayCell.income))}
          tone={dayCell.income > 0 ? "#34D399" : "#A1A1AA"}
        />
      </div>

      {biggest ? (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            ההוצאה הגדולה ביום
          </span>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-caption text-foreground">
              {biggest.entry.merchant ?? biggest.entry.note ?? "חיוב"}
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-caption font-medium text-[#F87171]"
            >
              −{ILS.format(Math.round(biggest.amount))}
            </span>
          </div>
        </div>
      ) : null}

      {categoriesUsed.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {categoriesUsed.map((c) => {
            const meta = getCategory(c);
            return (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                style={{
                  color: meta.accent,
                  borderColor: `${meta.accent}44`,
                  background: `${meta.accent}15`,
                }}
              >
                {meta.label}
              </span>
            );
          })}
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {entries.length === 0 ? (
          <li className="rounded-2xl border border-white/8 bg-black/25 p-3 text-center text-caption text-muted-foreground">
            לא חויב כלום ביום הזה. {dayCell.income > 0 ? "הכנסה צפויה." : "שקט."}
          </li>
        ) : (
          entries.map(({ entry, amount }, idx) => {
            const meta = getCategory(entry.category);
            return (
              <li
                key={`${entry.id}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/6 bg-black/25 p-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[12px] text-foreground">
                    {entry.merchant ?? entry.note ?? "חיוב"}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: meta.accent }}
                  >
                    {meta.label}
                  </span>
                </div>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-[12px] font-medium text-[#F87171]"
                >
                  −{ILS.format(Math.round(amount))}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </BottomSheet>
  );
}

function DayStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
