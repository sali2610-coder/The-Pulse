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
import {
  buildEngineCtx,
  getCreditExposure,
} from "@/lib/financial-engine";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { ExpenseEditFullScreen } from "@/components/expense-form/expense-edit-fullscreen";
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
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const deleteWithUndo = useDeleteWithUndo();

  // Phase 396 — single calculation path. All three views (header,
  // per-card statement rows, per-month folder drilldown) consume
  // the SAME engine output. No local sums, no parallel walkers.
  const ctx = useMemo(() => {
    if (!hydrated) return null;
    return buildEngineCtx({
      accounts,
      rules,
      statuses,
      entries,
      loans,
      incomes,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    rules,
    statuses,
    entries,
    loans,
    incomes,
    monthlyBudget,
  ]);

  // Header total — engine canonical credit exposure.
  const exposure = useMemo(() => {
    if (!ctx) return null;
    return getCreditExposure(ctx);
  }, [ctx]);

  // Per-(card × month) folder drilldown — buildCardMonthFolders is a
  // presentation rebucketing wrapper that now consumes the engine
  // exclusively (buildCardCategoryBreakdown rewritten in Phase 396).
  const report = useMemo(() => {
    if (!ctx) return null;
    return buildCardCategoryBreakdown({
      accounts: ctx.accounts,
      loans: ctx.loans,
      rules: ctx.rules,
      statuses: ctx.statuses,
      entries: ctx.entries,
      now: ctx.now,
    });
  }, [ctx]);

  const folders = useMemo(() => {
    if (!report) return [];
    return buildCardMonthFolders(report);
  }, [report]);

  if (!hydrated || !ctx || !report) return null;
  if (folders.length === 0) {
    return (
      <section
        className="glass-card chc-card flex flex-col gap-3 rounded-3xl p-5"
        data-polish="v2"
      >
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
      {/* Phase 404 — single section: the per-(card × billing month)
         folder list. The previous "top per-card statement list" was
         removed; it duplicated the same engine data shown below and
         crowded the screen. The total in the section header still
         comes from getCreditExposure so the cockpit + cards screen
         continue to match. */}
      <SectionHeader
        icon={<CreditCard />}
        title="כרטיסי אשראי לפי חודש"
        trailing={
          <span className="text-caption text-muted-foreground" dir="ltr">
            סה״כ {ILS.format(Math.round(exposure?.total ?? 0))}
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        כל כרטיס מציג את חיובי החודש הנוכחי + חודשי החיוב הבאים. תקיש
        על תיקייה לפתיחה, ועל סוג חיוב לסינון.
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

      <ExpenseEditFullScreen
        entryId={editingId}
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
      />
    </section>
  );
}

type KindFilters = { recurring: boolean; installments: boolean; oneTime: boolean };
const DEFAULT_KIND_FILTERS: KindFilters = {
  recurring: true,
  installments: true,
  oneTime: true,
};

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
  // Phase 298 — per-folder kind filter. Defaults to all-on every
  // mount. The parent DashboardSection unmounts on collapse (Phase
  // 271 ephemeral collapse store) so this resets between sessions /
  // tab switches without any persistence.
  const [filters, setFilters] = useState<KindFilters>(DEFAULT_KIND_FILTERS);
  const filteredSubtotal =
    (filters.recurring ? folder.recurringTotal : 0) +
    (filters.installments ? folder.installmentsTotal : 0) +
    (filters.oneTime ? folder.oneTimeTotal : 0);
  const filteredCategories = folder.categories
    .map((g) => {
      const total =
        (filters.recurring ? g.recurring : 0) +
        (filters.installments ? g.installments : 0) +
        (filters.oneTime ? g.oneTime : 0);
      return { group: g, total };
    })
    .filter((x) => x.total > 0);
  const allOff =
    !filters.recurring && !filters.installments && !filters.oneTime;
  const color = TIER_COLOR[folder.kind];
  return (
    <li
      className="chc-folder overflow-hidden rounded-2xl border border-white/8 bg-black/25"
      data-open={open ? "true" : undefined}
      style={
        {
          background: `linear-gradient(180deg, ${color}08 0%, rgba(0,0,0,0.25) 80%)`,
          "--chc-tone": color,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tap();
        }}
        aria-expanded={open}
        className="chc-folder-head flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
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
            {ILS.format(Math.round(filteredSubtotal))}
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
            className="chc-folder-body overflow-hidden border-t border-white/8"
          >
            <div className="flex flex-col gap-3 p-4">
              {/* Phase 298 — Stat tiles are now toggleable filters.
                 Active = full opacity + colored glow; inactive =
                 dimmed + softer border. Default all-on; resets when
                 the parent section unmounts on collapse. */}
              <div className="grid grid-cols-3 gap-2">
                <KindFilterTile
                  label="קבועים"
                  value={folder.recurringTotal}
                  tone="#A78BFA"
                  active={filters.recurring}
                  onToggle={() => {
                    tap();
                    setFilters((f) => ({ ...f, recurring: !f.recurring }));
                  }}
                />
                <KindFilterTile
                  label="תשלומים"
                  value={folder.installmentsTotal}
                  tone="#F59E0B"
                  active={filters.installments}
                  onToggle={() => {
                    tap();
                    setFilters((f) => ({
                      ...f,
                      installments: !f.installments,
                    }));
                  }}
                />
                <KindFilterTile
                  label="חד-פעמיים"
                  value={folder.oneTimeTotal}
                  tone="#60A5FA"
                  active={filters.oneTime}
                  onToggle={() => {
                    tap();
                    setFilters((f) => ({ ...f, oneTime: !f.oneTime }));
                  }}
                />
              </div>
              {allOff ? (
                <p className="rounded-2xl border border-white/8 bg-black/25 p-4 text-center text-caption text-muted-foreground">
                  בחר לפחות סוג חיוב אחד להצגה
                </p>
              ) : (
                <motion.ul
                  layout
                  className="flex flex-col gap-1.5"
                >
                  <AnimatePresence initial={false}>
                    {filteredCategories.map(({ group: g, total }) => (
                      <motion.div
                        key={g.category}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <CategoryRow
                          monthKey={folder.monthKey}
                          monthName={folder.monthName}
                          group={g}
                          filters={filters}
                          filteredTotal={total}
                          onEditEntry={onEditEntry}
                          onDeleteEntry={onDeleteEntry}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function KindFilterTile({
  label,
  value,
  count,
  tone,
  active,
  onToggle,
}: {
  label: string;
  value: number;
  /** Phase 401 — optional transaction count surfaced under the
   *  amount. The future-folder lens has no per-kind count; the
   *  per-card statement does, so this is rendered only when given. */
  count?: number;
  tone: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${active ? "כבה" : "הצג"} ${label}`}
      className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        active ? "opacity-100" : "opacity-55"
      }`}
      style={{
        background: active ? `${tone}14` : "rgba(0,0,0,0.30)",
        borderColor: active ? `${tone}55` : "rgba(255,255,255,0.08)",
        boxShadow: active
          ? `inset 0 0 0 1px ${tone}44, 0 8px 22px -16px ${tone}88`
          : undefined,
      }}
    >
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {ILS.format(Math.round(value))}
      </span>
      {typeof count === "number" ? (
        <span
          dir="rtl"
          className="text-[10px] text-muted-foreground/70"
        >
          {count > 0 ? `${count} חיובים` : "—"}
        </span>
      ) : null}
    </button>
  );
}

function CategoryRow({
  monthKey,
  monthName,
  group,
  filters,
  filteredTotal,
  onEditEntry,
  onDeleteEntry,
}: {
  monthKey: string;
  monthName: string;
  group: import("@/lib/card-category-breakdown").CategoryGroup;
  filters: KindFilters;
  filteredTotal: number;
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
                filters.recurring && group.recurring > 0
                  ? `${ILS.format(Math.round(group.recurring))} קבועים`
                  : null,
                filters.installments && group.installments > 0
                  ? `${ILS.format(Math.round(group.installments))} תשלומים`
                  : null,
                filters.oneTime && group.oneTime > 0
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
            {ILS.format(Math.round(filteredTotal))}
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
            {group.items
              .filter((it) =>
                it.kind === "recurring"
                  ? filters.recurring
                  : it.kind === "installments"
                    ? filters.installments
                    : filters.oneTime,
              )
              .map((it) => {
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
              // Phase 421 — installment metadata MUST resolve against the
              // purchase month of the slice (the month the engine assigned
              // when bucketing into the credit-card exposure), not the
              // folder's cash-settle month. Otherwise the displayed
              // paymentNumber drifts by +1 for every card because
              // effectiveCashAt maps to next month.
              const installmentMeta = isInstallment
                ? installmentMetaForRefId({
                    refId: it.refId,
                    monthKey: it.purchaseMonthKey ?? monthKey,
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

