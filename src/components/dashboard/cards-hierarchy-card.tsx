"use client";

// Phase 242 + 265 — per-card hierarchy, presented as Card-Month
// folders.
//
// Phase 242 split each card into per-category groups with kind
// totals. Phase 264 added month grouping inside a card. Phase 265
// completes the refactor: each (Card × Month) becomes its OWN
// top-level folder so the brain reads "Hitechzon — June" and
// "Hitechzon — July" as two distinct envelopes, never as one
// merged container. Engine unchanged — view restructure only.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CreditCard, Layers, Pencil, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import {
  buildCardMonthFolders,
  type CardMonthFolder,
} from "@/lib/card-month-folders";
import { getCategory } from "@/lib/categories";
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { ExpenseEditSheet } from "@/components/expense-form/expense-edit-sheet";
import { useDeleteWithUndo } from "@/lib/use-delete-with-undo";
import { installmentMetaForRefId } from "@/lib/installment-meta";
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

const TIER_COLOR: Record<CardMonthFolder["kind"], string> = {
  current: "#34D399",
  next: "#60A5FA",
  future: "#A78BFA",
};

const TIER_LABEL: Record<CardMonthFolder["kind"], string> = {
  current: "חיובים קרובים",
  next: "החודש הבא",
  future: "תשלומים עתידיים",
};

export function CardsHierarchyCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = entries.find((e) => e.id === editingId) ?? null;
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

  const folders = useMemo(() => {
    if (!report) return [];
    return buildCardMonthFolders(report);
  }, [report]);

  if (!hydrated || !report) return null;
  if (folders.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
        <SectionHeader icon={<CreditCard />} title="כרטיסי אשראי לפי חודש" />
        <CardEmpty
          icon={<Layers className="size-4" />}
          title="אין חיובי כרטיס לחודשים הקרובים"
          reason="ברגע שתוסיף הוצאות / מנויים שמחויבים בכרטיס, הם יופיעו כאן בתיקיות לפי כרטיס וחודש."
        />
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<CreditCard />}
        title="כרטיסי אשראי לפי חודש"
        trailing={
          <span className="text-caption text-muted-foreground" dir="ltr">
            סה״כ {ILS.format(Math.round(report.totalCommitted))}
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        כל כרטיס × חודש = תיקייה משלו. תקיש על תיקייה כדי לראות פירוט
        לקטגוריות ולהוצאות.
      </p>
      <ul className="flex flex-col gap-2">
        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
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

function FolderRow({
  folder,
  onEditEntry,
  onDeleteEntry,
}: {
  folder: CardMonthFolder;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = TIER_COLOR[folder.kind];
  return (
    <li
      className="overflow-hidden rounded-2xl border border-white/8 bg-black/25"
      style={{
        background: `linear-gradient(180deg, ${color}08 0%, rgba(0,0,0,0.25) 80%)`,
      }}
    >
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
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}22`, color }}
          >
            <CreditCard className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-section text-foreground">
              {folder.cardLabel}
              <span className="text-foreground/70"> — {folder.monthName}</span>
            </span>
            <span
              className="text-caption"
              style={{ color }}
            >
              {TIER_LABEL[folder.kind]}
              {folder.cardLast4 ? (
                <span className="text-muted-foreground/80" dir="ltr">
                  {" "}· ····{folder.cardLast4}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-section text-foreground"
          >
            {ILS.format(Math.round(folder.subtotal))}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
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
              {/* Stat strip scoped to THIS folder (card × month). */}
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  label="קבועים"
                  value={folder.recurringTotal}
                  tone="#A78BFA"
                />
                <Stat
                  label="תשלומים"
                  value={folder.installmentsTotal}
                  tone="#F59E0B"
                />
                <Stat
                  label="חד-פעמיים"
                  value={folder.oneTimeTotal}
                  tone="#60A5FA"
                />
              </div>
              <ul className="flex flex-col gap-1.5">
                {folder.categories.map((g) => (
                  <CategoryRow
                    key={g.category}
                    monthKey={folder.monthKey}
                    monthName={folder.monthName}
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
  monthKey,
  monthName,
  group,
  onEditEntry,
  onDeleteEntry,
}: {
  monthKey: string;
  monthName: string;
  group: import("@/lib/card-category-breakdown").CategoryGroup;
  onEditEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = getCategory(group.category);
  const Icon = meta.icon;
  // Read live store for installment progress lookups.
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
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
            transition={{ duration: 0.18 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="items"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-white/6"
          >
            {group.items.map((it) => {
              const entryId = it.refId.startsWith("entry:")
                ? it.refId.split(":")[1]
                : null;
              const isInstallment = it.kind === "installments";
              const kindLabel =
                it.kind === "recurring"
                  ? "קבוע"
                  : isInstallment
                    ? "תשלום"
                    : "חד-פעמי";
              // Phase 269 — pull installment progress for stronger
              // visual identity. null for recurring + oneTime rows.
              const installmentMeta = isInstallment
                ? installmentMetaForRefId({
                    refId: it.refId,
                    monthKey,
                    entries,
                    rules,
                  })
                : null;
              return (
                <li
                  key={`${it.refId}-${it.effectiveCashAt}`}
                  className={`flex items-start gap-2 px-4 py-2 ${
                    isInstallment ? "border-r-2 border-r-[#F59E0B]/60" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-caption text-foreground">
                        {it.label}
                      </span>
                      {isInstallment ? <InstallmentBadge /> : null}
                    </span>
                    {installmentMeta ? (
                      <InstallmentMetaLines meta={installmentMeta} />
                    ) : (
                      <span className="text-caption text-muted-foreground/80">
                        {kindLabel} · חיוב {monthName} ·{" "}
                        {DAY_FMT.format(new Date(it.effectiveCashAt))}
                      </span>
                    )}
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
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
