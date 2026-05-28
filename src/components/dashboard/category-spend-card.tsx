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
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { ExpenseEditSheet } from "@/components/expense-form/expense-edit-sheet";
import { useDeleteWithUndo } from "@/lib/use-delete-with-undo";

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
  const [monthKey, setMonthKey] = useState<MonthKey>(currentMonthKey());

  const report = useMemo(() => {
    if (!hydrated) return null;
    return buildCategorySpend({
      entries,
      rules,
      statuses,
      monthKey,
    });
  }, [hydrated, entries, rules, statuses, monthKey]);

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

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = monthKey === p.monthKey;
          return (
            <button
              key={p.key}
              type="button"
              data-no-min-tap
              onClick={() => {
                tap();
                setMonthKey(p.monthKey);
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
      {isEmpty ? (
        <CardEmpty
          icon={<PieChart className="size-4" />}
          title="אין נתונים לחודש שנבחר"
          reason="נסה חודש אחר או הוסף הוצאה ראשונה כדי שנתחיל לבנות את התמונה."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {report.byCategory.map((g) => (
            <CategoryRow
              key={g.category}
              group={g}
              total={report.total}
              onEditEntry={(id) => setEditingId(id)}
              onDeleteEntry={(id) => deleteWithUndo(id)}
            />
          ))}
        </ul>
      )}

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
  onEditEntry,
  onDeleteEntry,
}: {
  group: CategorySpendBreakdown;
  total: number;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = getCategory(group.category);
  const Icon = meta.icon;
  const share = total > 0 ? group.total / total : 0;
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
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/8"
          >
            {group.items.map((it) => (
              <li
                key={`${it.source}-${it.id}`}
                className="flex items-center gap-2 px-4 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-body text-foreground">
                    {it.label}
                  </span>
                  <span className="text-caption text-muted-foreground/80">
                    {it.isRecurring ? "קבוע" : "חד-פעמי"} ·{" "}
                    {DAY_FMT.format(new Date(it.chargeDate))}
                  </span>
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
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
