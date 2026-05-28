"use client";

// Phase 242 — per-card hierarchy: Card → Categories → kind splits.
//
// Replaces the flat "long list of expenses" inside the cards
// section with a three-level drill-down. Each card row is
// collapsible: opening it reveals categories sorted by total;
// each category opens to show its individual obligations.
//
// Reads the cash-flow-bucket engine + per-rule / per-entry
// categories — no new financial logic.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CreditCard, Layers, Pencil, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildCardCategoryBreakdown,
  type CardBreakdown,
  type CategoryGroup,
} from "@/lib/card-category-breakdown";
import { getCategory } from "@/lib/categories";
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { ExpenseEditSheet } from "@/components/expense-form/expense-edit-sheet";
import { useDeleteWithUndo } from "@/lib/use-delete-with-undo";
import { groupItemsByMonth } from "@/lib/card-month-grouping";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

export function CardsHierarchyCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry =
    entries.find((e) => e.id === editingId) ?? null;
  const deleteWithUndo = useDeleteWithUndo();

  const report = useMemo(() => {
    if (!hydrated) return null;
    return buildCardCategoryBreakdown({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
  }, [hydrated, accounts, loans, rules, statuses, entries]);

  if (!hydrated || !report) return null;
  if (report.cards.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
        <SectionHeader icon={<CreditCard />} title="כרטיסי אשראי לפי קטגוריה" />
        <CardEmpty
          icon={<Layers className="size-4" />}
          title="אין חיובי כרטיס לחודש הקרוב"
          reason="ברגע שתוסיף הוצאות / מנויים שמחויבים בכרטיס, הם יופיעו כאן מקובצים לפי קטגוריה."
        />
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<CreditCard />}
        title="כרטיסי אשראי לפי קטגוריה"
        trailing={
          <span className="text-caption text-muted-foreground" dir="ltr">
            סה״כ {ILS.format(Math.round(report.totalCommitted))}
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        כל כרטיס נשמר נפרד. בתוך כרטיס — קטגוריות; בתוך קטגוריה — חיובים
        קבועים, תשלומים וחד-פעמיים.
      </p>
      <ul className="flex flex-col gap-2">
        {report.cards.map((c) => (
          <CardRow
            key={c.cardId}
            card={c}
            onEditEntry={(id) => setEditingId(id)}
            onDeleteEntry={(id) => deleteWithUndo(id)}
          />
        ))}
      </ul>

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

function CardRow({
  card,
  onEditEntry,
  onDeleteEntry,
}: {
  card: CardBreakdown;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden rounded-2xl border border-white/8 bg-black/25">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tap();
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--neon)]/14 text-[color:var(--neon)]">
            <CreditCard className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-section text-foreground">
              {card.cardLabel}
            </span>
            <span className="text-caption text-muted-foreground" dir="ltr">
              {card.cardLast4 ? `····${card.cardLast4} · ` : ""}
              {card.nextSettlementAt
                ? `חיוב הבא ${DAY_FMT.format(new Date(card.nextSettlementAt))}`
                : "אין חיוב צפוי"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-section text-foreground"
          >
            {ILS.format(Math.round(card.total))}
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

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="flex flex-col gap-3 p-4">
              {/* Per-card totals — recurring / installments / oneTime. */}
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  label="קבועים"
                  value={card.recurringTotal}
                  tone="#A78BFA"
                />
                <Stat
                  label="תשלומים"
                  value={card.installmentsTotal}
                  tone="#F59E0B"
                />
                <Stat
                  label="חד-פעמיים"
                  value={card.oneTimeTotal}
                  tone="#60A5FA"
                />
              </div>
              <ul className="flex flex-col gap-1.5">
                {card.categories.map((g) => (
                  <CategoryRow
                    key={g.category}
                    group={g}
                    onEditEntry={onEditEntry}
                    onDeleteEntry={onDeleteEntry}
                  />
                ))}
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-white/8 bg-black/30 p-2.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {ILS.format(Math.round(value))}
      </span>
    </div>
  );
}

function CategoryRow({
  group,
  onEditEntry,
  onDeleteEntry,
}: {
  group: CategoryGroup;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = getCategory(group.category);
  const Icon = meta.icon;
  return (
    <li className="overflow-hidden rounded-xl border border-white/6 bg-black/15">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tap();
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-white/3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${meta.accent}22`, color: meta.accent }}
          >
            <Icon className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-body text-foreground">{meta.label}</span>
            <span className="text-caption text-muted-foreground">
              {[
                group.recurring > 0
                  ? `${ILS.format(Math.round(group.recurring))} קבועים`
                  : null,
                group.installments > 0
                  ? `${ILS.format(Math.round(group.installments))} תשלומים`
                  : null,
                group.oneTime > 0
                  ? `${ILS.format(Math.round(group.oneTime))} חד-פעמי`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-body font-medium text-foreground"
          >
            {ILS.format(Math.round(group.total))}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="items"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/6"
          >
            {/* Phase 264 — split items into month buckets so the user
                reads "חיובים קרובים" + "החודש הבא" + "תשלומים עתידיים"
                separately. Subtotal per group + per-row charge-month
                label reduces emotional overload from the merged total. */}
            {groupItemsByMonth(group.items).map((monthGroup) => {
              const toneColor =
                monthGroup.kind === "current"
                  ? "#34D399"
                  : monthGroup.kind === "next"
                    ? "#60A5FA"
                    : "#A78BFA";
              return (
                <section
                  key={monthGroup.monthKey}
                  className="border-b border-white/4 last:border-b-0"
                >
                  <header
                    className="flex items-baseline justify-between gap-2 px-4 py-2"
                    style={{
                      background: `linear-gradient(90deg, ${toneColor}10 0%, transparent 60%)`,
                    }}
                  >
                    <span
                      className="text-micro"
                      style={{ color: toneColor }}
                    >
                      {monthGroup.label}
                    </span>
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="text-caption font-medium"
                      style={{ color: toneColor }}
                    >
                      {ILS.format(Math.round(monthGroup.subtotal))}
                    </span>
                  </header>
                  <ul className="flex flex-col">
                    {monthGroup.items.map((it) => {
                      // Refs: `entry:<id>:<sliceIndex>` for card-entry,
                      // `rule:<id>` for linked-rule rows. Only entries
                      // can be edited inline.
                      const entryId = it.refId.startsWith("entry:")
                        ? it.refId.split(":")[1]
                        : null;
                      const kindLabel =
                        it.kind === "recurring"
                          ? "קבוע"
                          : it.kind === "installments"
                            ? "תשלום"
                            : "חד-פעמי";
                      return (
                        <li
                          key={`${it.refId}-${it.effectiveCashAt}`}
                          className="flex items-center gap-2 px-4 py-2"
                        >
                          <div className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-caption text-foreground">
                              {it.label}
                            </span>
                            <span className="text-caption text-muted-foreground/80">
                              {kindLabel} · חיוב {monthGroup.monthName}
                            </span>
                          </div>
                          <span
                            data-mono="true"
                            dir="ltr"
                            className="text-caption font-medium text-foreground"
                          >
                            {ILS.format(Math.round(it.amount))}
                          </span>
                          {entryId ? (
                    <>
                      <button
                        type="button"
                        data-no-min-tap
                        onClick={() => {
                          tap();
                          onEditEntry(entryId);
                        }}
                        aria-label="ערוך"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        data-no-min-tap
                        onClick={() => onDeleteEntry(entryId)}
                        aria-label="מחק"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-destructive/80 hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
