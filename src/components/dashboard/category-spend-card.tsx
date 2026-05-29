"use client";

// Phase 243 — category intelligence card.
//
// Per-category spend for the current month split into recurring vs
// discretionary, sorted by total. Each row is collapsible and opens
// to its individual transactions. Colors come from the canonical
// CATEGORIES palette so visual scanning stays consistent across
// dashboard / donut / breakdown surfaces.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pencil, PieChart, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildCategorySpend,
  type CategorySpendBreakdown,
} from "@/lib/category-spend";
import { addMonths, currentMonthKey } from "@/lib/dates";
import type { MonthKey } from "@/types/finance";
import { getCategory } from "@/lib/categories";
import { categoryTrends } from "@/lib/forecast";
import { ruleSchedule } from "@/lib/installment-schedule";
import { sliceForMonth } from "@/lib/projections";
import { TrendingDown, TrendingUp } from "lucide-react";
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { ExpenseEditSheet } from "@/components/expense-form/expense-edit-sheet";
import { useDeleteWithUndo } from "@/lib/use-delete-with-undo";
import { installmentMetaForSource } from "@/lib/installment-meta";
import {
  InstallmentBadge,
  InstallmentMetaLines,
} from "@/components/dashboard/installment-row-meta";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

export function CategorySpendCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = entries.find((e) => e.id === editingId) ?? null;
  const deleteWithUndo = useDeleteWithUndo();

  // Phase 260 — period chips. Default to the current month; chips
  // for "חודש שעבר" + "לפני 2 חודשים" so the user can compare
  // patterns without leaving the card. monthKey lives in state so
  // the buildCategorySpend memo re-runs on switch.
  // Phase 283 — list is now collapsed by default. Pressing a chip
  // opens its month; pressing the active chip again closes the list.
  // Only one month view is open at a time, with smooth height +
  // staggered row reveal.
  const [monthKey, setMonthKey] = useState<MonthKey>(currentMonthKey());
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return buildCategorySpend({
      entries,
      rules,
      statuses,
      monthKey,
    });
  }, [hydrated, entries, rules, statuses, monthKey]);

  // Phase 280 — MoM trend + ending-installment count per category so
  // each collapsed row can show "in motion" cues without expanding.
  // Reuses categoryTrends (3-month lookback) from the forecast engine.
  const trendByCategory = useMemo(() => {
    if (!hydrated) return new Map<string, number>();
    const trends = categoryTrends({ entries, monthKey, lookback: 3 });
    const m = new Map<string, number>();
    for (const t of trends) {
      if (t.deltaPct !== null) m.set(t.category, t.deltaPct);
    }
    return m;
  }, [hydrated, entries, monthKey]);

  const endingByCategory = useMemo(() => {
    if (!hydrated) return new Map<string, number>();
    const nextKey = addMonths(monthKey, 1);
    const m = new Map<string, number>();
    for (const rule of rules) {
      if (!rule.active) continue;
      if (!rule.installmentTotal || rule.installmentTotal <= 1) continue;
      const here = ruleSchedule(rule, monthKey);
      const there = ruleSchedule(rule, nextKey);
      if (here.active && !there.active) {
        m.set(rule.category, (m.get(rule.category) ?? 0) + 1);
      }
    }
    for (const e of entries) {
      if (e.installments <= 1) continue;
      const here = sliceForMonth(e, monthKey);
      const there = sliceForMonth(e, nextKey);
      if (here && !there) {
        m.set(e.category, (m.get(e.category) ?? 0) + 1);
      }
    }
    return m;
  }, [hydrated, rules, entries, monthKey]);

  const presets: Array<{ key: string; label: string; monthKey: MonthKey }> = [
    { key: "this", label: "החודש", monthKey: currentMonthKey() },
    { key: "prev", label: "חודש שעבר", monthKey: addMonths(currentMonthKey(), -1) },
    { key: "prev2", label: "לפני 2 חודשים", monthKey: addMonths(currentMonthKey(), -2) },
  ];

  if (!hydrated || !report) return null;
  const isEmpty = report.byCategory.length === 0;

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<PieChart />}
        title="לאן הולך הכסף"
        trailing={
          <span className="text-caption text-muted-foreground" dir="ltr">
            סה״כ {ILS.format(Math.round(report.total))}
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        חלוקה לפי קטגוריה. כל קטגוריה מפצלת בין חיובים קבועים להוצאות
        חד-פעמיות, וניתן לפתוח לרשימה מפורטת.
      </p>

      <SegmentedPreview report={report} />

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = revealedKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              data-no-min-tap
              aria-pressed={active}
              onClick={() => {
                tap();
                if (active) {
                  setRevealedKey(null);
                  return;
                }
                setMonthKey(p.monthKey);
                setRevealedKey(p.key);
              }}
              className={`text-caption rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-[color:var(--neon)]/25 text-[color:var(--neon)]"
                  : "border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {revealedKey ? (
          <motion.div
            key={revealedKey}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {isEmpty ? (
              <CardEmpty
                icon={<PieChart className="size-4" />}
                title="אין נתונים לחודש שנבחר"
                reason="נסה חודש אחר או הוסף הוצאה ראשונה כדי שנתחיל לבנות את התמונה."
              />
            ) : (
              <ul className="flex flex-col gap-1.5 pt-2">
                {report.byCategory.map((g, i) => (
                  <motion.div
                    key={g.category}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.035, 0.3),
                      duration: 0.2,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <CategoryRow
                      group={g}
                      total={report.total}
                      monthKey={monthKey}
                      deltaPct={trendByCategory.get(g.category) ?? null}
                      endingCount={endingByCategory.get(g.category) ?? 0}
                      onEditEntry={(id) => setEditingId(id)}
                      onDeleteEntry={(id) => deleteWithUndo(id)}
                    />
                  </motion.div>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ExpenseEditSheet
        entry={editingEntry}
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
      />
    </section>
  );
}

function CategoryRow({
  group,
  total,
  monthKey,
  deltaPct,
  endingCount,
  onEditEntry,
  onDeleteEntry,
}: {
  group: CategorySpendBreakdown;
  total: number;
  monthKey: MonthKey;
  deltaPct: number | null;
  endingCount: number;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = getCategory(group.category);
  const Icon = meta.icon;
  const share = total > 0 ? group.total / total : 0;
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  return (
    <li className="overflow-hidden rounded-2xl border border-white/8 bg-black/25">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tap();
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-white/3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${meta.accent}22`, color: meta.accent }}
          >
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-section text-foreground">{meta.label}</span>
            <span className="text-caption text-muted-foreground">
              {[
                group.recurring > 0
                  ? `${ILS.format(Math.round(group.recurring))} קבועים`
                  : null,
                group.discretionary > 0
                  ? `${ILS.format(Math.round(group.discretionary))} משתנים`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
            {/* Phase 279 — fixed-vs-variable micro chip.
                Phase 280 — MoM trend + ending-installment + anomaly
                chips, rendered inline so the user reads the
                "in-motion" signals without expanding the row. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {group.total > 0 && (group.recurring > 0 || group.discretionary > 0) ? (
                <span
                  className="inline-flex w-fit items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                  aria-label="פילוח קבועים מול משתנים"
                >
                  {Math.round((group.recurring / group.total) * 100)}% קבוע
                </span>
              ) : null}
              {deltaPct !== null && Math.abs(deltaPct) >= 0.15 ? (
                <TrendChip deltaPct={deltaPct} />
              ) : null}
              {deltaPct !== null && deltaPct >= 0.4 ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "#F8717122", color: "#FCA5A5" }}
                  aria-label="עלייה חריגה בקטגוריה"
                >
                  ⚠ חריגה
                </span>
              ) : null}
              {endingCount > 0 ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "#34D39922", color: "#86EFAC" }}
                  aria-label="תשלומים שמסתיימים החודש"
                >
                  {endingCount} מסתיים
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-section text-foreground"
          >
            {ILS.format(Math.round(group.total))}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="size-5" />
          </motion.span>
        </div>
      </button>

      {/* Share bar — visual category color across the row width. */}
      <div className="h-1 w-full bg-white/5">
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.max(2, Math.round(share * 100))}%`,
            background: meta.accent,
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="items"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            // Phase 280 — premium spring-like ease. Slightly slower
            // than the 200ms snap so the user perceives the depth
            // change, not just a state flip.
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8"
          >
            {group.items.map((it, rowIdx) => {
              // Phase 269 — pull installment progress so installment
              // rows show "תשלום 3 מתוך 12" + ₪/חודש · סה״כ.
              const installmentMeta = installmentMetaForSource({
                source: it.source,
                id: it.id,
                monthKey,
                entries,
                rules,
              });
              const isInstallment = installmentMeta !== null;
              const kindLabel = isInstallment
                ? "תשלום"
                : it.isRecurring
                  ? "קבוע"
                  : "חד-פעמי";
              return (
              <motion.li
                key={`${it.source}-${it.id}`}
                // Phase 280 — staggered subtle entrance. Cap at ~250ms
                // so longer lists don't drag.
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(rowIdx * 0.028, 0.25),
                  duration: 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`flex items-start gap-2 px-4 py-2 ${
                  isInstallment ? "border-r-2 border-r-[#F59E0B]/60" : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-body text-foreground">
                      {it.label}
                    </span>
                    {isInstallment ? <InstallmentBadge /> : null}
                  </span>
                  {installmentMeta ? (
                    <InstallmentMetaLines meta={installmentMeta} />
                  ) : (
                    <span className="text-caption text-muted-foreground/80">
                      {kindLabel} ·{" "}
                      {DAY_FMT.format(new Date(it.chargeDate))}
                    </span>
                  )}
                </div>
                {it.source === "entry" ? (
                  <>
                    <button
                      type="button"
                      data-no-min-tap
                      onClick={() => {
                        tap();
                        onEditEntry(it.id);
                      }}
                      aria-label="ערוך"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      data-no-min-tap
                      onClick={() => onDeleteEntry(it.id)}
                      aria-label="מחק"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-destructive/80 hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : null}
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-body font-medium text-foreground"
                >
                  {ILS.format(Math.round(it.amount))}
                </span>
              </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function SegmentedPreview({
  report,
}: {
  report: {
    total: number;
    byCategory: CategorySpendBreakdown[];
  };
}) {
  if (report.total <= 0 || report.byCategory.length === 0) return null;
  // Top 5 categories by spend, remainder folded into "other".
  const top = [...report.byCategory]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const topSum = top.reduce((s, g) => s + g.total, 0);
  const tail = Math.max(0, report.total - topSum);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-white/5"
        role="img"
        aria-label="פירוט קטגוריות"
      >
        {top.map((g) => {
          const meta = getCategory(g.category);
          const share = (g.total / report.total) * 100;
          return (
            <span
              key={g.category}
              style={{
                width: `${Math.max(1.5, share)}%`,
                background: meta.accent,
              }}
              className="h-full"
            />
          );
        })}
        {tail > 0 ? (
          <span
            style={{
              width: `${Math.max(1.5, (tail / report.total) * 100)}%`,
              background: "#ffffff14",
            }}
            className="h-full"
          />
        ) : null}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {top.slice(0, 3).map((g) => {
          const meta = getCategory(g.category);
          const pct = Math.round((g.total / report.total) * 100);
          return (
            <li
              key={g.category}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: meta.accent }}
                aria-hidden
              />
              {meta.label}
              <span dir="ltr" data-mono="true" className="text-foreground/80">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrendChip({ deltaPct }: { deltaPct: number }) {
  const up = deltaPct > 0;
  const color = up ? "#F87171" : "#34D399";
  const Icon = up ? TrendingUp : TrendingDown;
  const pct = Math.round(Math.abs(deltaPct) * 100);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: `${color}1f`, color }}
      aria-label={`שינוי לעומת חודשים אחרונים`}
      dir="ltr"
    >
      <Icon className="size-3" />
      {up ? "+" : "−"}
      {pct}%
    </span>
  );
}
