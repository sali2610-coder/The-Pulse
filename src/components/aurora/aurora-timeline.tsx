"use client";

// Phase 436 · AURORA v1 — Timeline screen
//
// Unified vertical timeline: past entries (recent first) + future
// projected events (soonest first), grouped by day with sticky
// headers. Filters: range / direction / category / account. Search.
// Tap past row → premium detail sheet w/ edit category + delete +
// undo. Tap projection row → projection detail with kind / days
// until / amount.
//
// Important: this screen is a UI-only consumer of existing engine
// surfaces. No formulas, no financial behavior changed.

import { useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import {
  LaneDot,
  LedgerRow,
} from "@/components/aurora/aurora-ledger-row";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES, getCategory, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import type { ExpenseEntry } from "@/types/finance";

import { AuroraCheckpointsWorkspace } from "./aurora-checkpoints-workspace";
import {
  filterTimeline,
  useAuroraTimeline,
  type AuroraTimelineFilters,
  type AuroraTimelineItem,
} from "./use-aurora-timeline";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const FULL_TIME = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const HOUR = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

const RANGE_FILTERS: Array<{ key: AuroraTimelineFilters["range"]; label: string }> = [
  { key: "all", label: "הכל" },
  { key: "past", label: "בוצעו" },
  { key: "future", label: "מתוכננים" },
];

const DIRECTION_FILTERS: Array<{ key: AuroraTimelineFilters["direction"]; label: string }> = [
  { key: "all", label: "כל הכיוונים" },
  { key: "out", label: "יציאות" },
  { key: "in", label: "כניסות" },
];

function laneColor(item: AuroraTimelineItem): string {
  if (item.direction === "in" || item.isRefund) return "var(--aurora-state-safe)";
  if (item.bankPending || item.needsConfirmation) return "var(--aurora-state-watch)";
  if (item.origin === "projection") {
    switch (item.projectionKind) {
      case "income":
        return "var(--aurora-state-safe)";
      case "card":
        return "var(--aurora-lane-card)";
      case "loan":
        return "var(--aurora-lane-loan)";
      default:
        return "var(--aurora-lane-bank)";
    }
  }
  if (item.isWithdrawal) return "var(--aurora-lane-cash)";
  if (item.paySource === "credit") return "var(--aurora-lane-card)";
  return "var(--aurora-lane-bank)";
}

function categoryLabel(cat: string | undefined): string {
  if (!cat) return "—";
  try {
    return getCategory(cat as CategoryId)?.label ?? cat;
  } catch {
    return cat;
  }
}

export function AuroraTimeline() {
  const data = useAuroraTimeline();
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const restoreExpense = useFinanceStore((s) => s.restoreExpense);
  const entries = useFinanceStore((s) => s.entries);
  const accounts = useFinanceStore((s) => s.accounts);

  const [filters, setFilters] = useState<AuroraTimelineFilters>({
    query: "",
    range: "all",
    direction: "all",
    category: "all",
    account: "all",
  });
  const [selected, setSelected] = useState<AuroraTimelineItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const allItems = useMemo(
    () => [...data.past.flatMap((d) => d.rows), ...data.future.flatMap((d) => d.rows)],
    [data.past, data.future],
  );

  const filteredItems = useMemo(
    () => filterTimeline(allItems, filters),
    [allItems, filters],
  );

  const futureItems = useMemo(
    () => filteredItems.filter((i) => i.bucket === "future"),
    [filteredItems],
  );
  const pastItems = useMemo(
    () => filteredItems.filter((i) => i.bucket !== "future"),
    [filteredItems],
  );

  const groupByDay = (items: AuroraTimelineItem[], dir: "asc" | "desc") => {
    const map = new Map<string, AuroraTimelineItem[]>();
    for (const it of items) {
      const key = it.whenISO.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .sort((a, b) => (dir === "asc" ? (a[0] < b[0] ? -1 : 1) : a[0] < b[0] ? 1 : -1))
      .map(([dayISO, rows]) => ({
        dayISO,
        rows,
        totalOut: rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0),
        totalIn: rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0),
      }));
  };

  const futureDays = useMemo(() => groupByDay(futureItems, "asc"), [futureItems]);
  const pastDays = useMemo(() => groupByDay(pastItems, "desc"), [pastItems]);

  const closeDetail = () => {
    setSelected(null);
    setPickerOpen(false);
  };

  const handleChangeCategory = (id: CategoryId) => {
    if (!selected?.entryId || selected.source === "demo") {
      toast.error("הקטגוריה ניתנת לשינוי רק בעסקאות אמיתיות.");
      setPickerOpen(false);
      return;
    }
    const updated = updateExpense(selected.entryId, { category: id });
    if (!updated) {
      toast.error("לא הצלחנו לעדכן את הקטגוריה.");
      return;
    }
    setSelected({ ...selected, category: id });
    setPickerOpen(false);
    toast.success(`הקטגוריה עודכנה ל-${getCategory(id).label}`);
  };

  const handleDelete = () => {
    if (!selected?.entryId || selected.source === "demo") {
      toast.error("מחיקה זמינה רק בעסקאות אמיתיות.");
      return;
    }
    const original: ExpenseEntry | undefined = entries.find(
      (e) => e.id === selected.entryId,
    );
    deleteExpense(selected.entryId);
    closeDetail();
    toast(`נמחק: ${selected.label}`, {
      action: original
        ? { label: "בטל", onClick: () => restoreExpense(original) }
        : undefined,
    });
  };

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of allItems) {
      if (it.category) set.add(it.category);
    }
    return Array.from(set);
  }, [allItems]);

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.active)
        .map((a) => ({
          id: a.id,
          label: a.label + (a.cardLast4 ? ` ****${a.cardLast4}` : ""),
        })),
    [accounts],
  );

  return (
    <div className="aurora-timeline-stack">
      <h1 className="sr-only">ציר זמן פיננסי</h1>

      <AuroraCheckpointsWorkspace />

      <TimelineSummary
        monthLabel={data.monthLabel}
        totals={data.totals}
        isDemo={data.isDemo}
      />

      <div className="aurora-activity-search">
        <input
          type="search"
          inputMode="search"
          dir="rtl"
          placeholder="חיפוש בכל הציר…"
          value={filters.query}
          onChange={(e) => setFilters((s) => ({ ...s, query: e.target.value }))}
          aria-label="חיפוש בציר הזמן"
          className="aurora-activity-input"
        />
      </div>

      <FilterChipRow
        label="חלון"
        options={RANGE_FILTERS.map((r) => ({ key: r.key, label: r.label }))}
        value={filters.range}
        onChange={(v) =>
          setFilters((s) => ({ ...s, range: v as AuroraTimelineFilters["range"] }))
        }
      />
      <FilterChipRow
        label="כיוון"
        options={DIRECTION_FILTERS.map((d) => ({ key: d.key, label: d.label }))}
        value={filters.direction}
        onChange={(v) =>
          setFilters((s) => ({ ...s, direction: v as AuroraTimelineFilters["direction"] }))
        }
      />
      {categoryOptions.length > 0 ? (
        <FilterChipRow
          label="קטגוריה"
          options={[
            { key: "all", label: "כל הקטגוריות" },
            ...categoryOptions.map((c) => ({ key: c, label: categoryLabel(c) })),
          ]}
          value={filters.category}
          onChange={(v) => setFilters((s) => ({ ...s, category: v }))}
        />
      ) : null}
      {accountOptions.length > 0 ? (
        <FilterChipRow
          label="חשבון / כרטיס"
          options={[
            { key: "all", label: "כל החשבונות" },
            ...accountOptions.map((a) => ({ key: a.id, label: a.label })),
          ]}
          value={filters.account}
          onChange={(v) => setFilters((s) => ({ ...s, account: v }))}
        />
      ) : null}

      {futureDays.length === 0 && pastDays.length === 0 ? (
        <TimelineEmpty
          message={
            filters.query.length > 0
              ? `אין תוצאות עבור "${filters.query}".`
              : "לא נמצאו פריטים לסינון שבחרת."
          }
        />
      ) : (
        <div className="aurora-timeline-flow">
          {futureDays.length > 0 ? (
            <SectionBlock title="מתוכננים מהיום והלאה" tone="future">
              {futureDays.map((d, idx) => (
                <TimelineDay
                  key={`f-${d.dayISO}`}
                  index={idx}
                  dayISO={d.dayISO}
                  rows={d.rows}
                  totalOut={d.totalOut}
                  totalIn={d.totalIn}
                  onPick={setSelected}
                />
              ))}
            </SectionBlock>
          ) : null}

          {pastDays.length > 0 ? (
            <SectionBlock title="בוצעו לאחרונה" tone="past">
              {pastDays.map((d, idx) => (
                <TimelineDay
                  key={`p-${d.dayISO}`}
                  index={idx}
                  dayISO={d.dayISO}
                  rows={d.rows}
                  totalOut={d.totalOut}
                  totalIn={d.totalIn}
                  onPick={setSelected}
                />
              ))}
            </SectionBlock>
          ) : null}
        </div>
      )}

      <BottomSheet
        open={selected !== null}
        onOpenChange={(o) => (o ? null : closeDetail())}
        title={selected?.label ?? ""}
      >
        {selected ? (
          <TimelineDetail
            item={selected}
            onPickCategory={() => setPickerOpen(true)}
            onDelete={handleDelete}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="שנה קטגוריה"
      >
        <ul className="aurora-cat-picker" role="listbox">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.id === (selected?.category as CategoryId);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="aurora-cat-picker-item"
                  role="option"
                  aria-selected={active}
                  data-aurora-active={active ? "true" : "false"}
                  onClick={() => handleChangeCategory(c.id)}
                >
                  <span
                    aria-hidden
                    className="aurora-cat-picker-icon"
                    style={{ background: `${c.accent}28`, color: c.accent }}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="aurora-cat-picker-label">{c.label}</span>
                  {active ? (
                    <span aria-hidden className="aurora-cat-picker-check">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </div>
  );
}

function TimelineSummary({
  monthLabel,
  totals,
  isDemo,
}: {
  monthLabel: string;
  totals: { pastIn: number; pastOut: number; futureIn: number; futureOut: number };
  isDemo: boolean;
}) {
  const netFuture = totals.futureIn - totals.futureOut;
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 2, text: `ציר זמן · ${monthLabel}` }}>
          ציר זמן · {monthLabel}
        </Eyebrow>
        {isDemo ? (
          <span aria-hidden className="aurora-demo-pill">
            תצוגת דמו
          </span>
        ) : null}
      </div>
      <div className="aurora-timeline-summary-grid">
        <SummaryCell
          eyebrow="עד עכשיו"
          inAmount={totals.pastIn}
          outAmount={totals.pastOut}
        />
        <SummaryCell
          eyebrow="מתוכננים"
          inAmount={totals.futureIn}
          outAmount={totals.futureOut}
          netAmount={netFuture}
        />
      </div>
    </GlassCard>
  );
}

function SummaryCell({
  eyebrow,
  inAmount,
  outAmount,
  netAmount,
}: {
  eyebrow: string;
  inAmount: number;
  outAmount: number;
  netAmount?: number;
}) {
  return (
    <div className="aurora-timeline-summary-cell">
      <Eyebrow>{eyebrow}</Eyebrow>
      <div className="aurora-timeline-summary-numbers" dir="ltr">
        {inAmount > 0 ? (
          <span className="aurora-activity-in">+{ILS.format(inAmount)}</span>
        ) : null}
        {outAmount > 0 ? (
          <span className="aurora-activity-out">−{ILS.format(outAmount)}</span>
        ) : null}
      </div>
      {netAmount !== undefined ? (
        <span
          dir="ltr"
          className="aurora-timeline-net"
          style={{
            color:
              netAmount >= 0
                ? "var(--aurora-state-safe)"
                : "var(--aurora-state-danger)",
          }}
        >
          {netAmount >= 0 ? "+" : "−"}
          {ILS.format(Math.abs(netAmount))} נטו
        </span>
      ) : null}
    </div>
  );
}

function FilterChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-timeline-filter-row">
      <span className="aurora-timeline-filter-label">{label}</span>
      <div className="aurora-activity-filters" role="tablist" aria-label={label}>
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <motion.button
              key={opt.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onChange(opt.key)}
              className="aurora-filter-chip"
              data-aurora-active={active ? "true" : "false"}
              whileTap={reduced ? undefined : { scale: 0.96 }}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "past" | "future";
  children: ReactNode;
}) {
  return (
    <section className="aurora-timeline-section">
      <header className="aurora-timeline-section-head">
        <span
          aria-hidden
          className="aurora-timeline-section-dot"
          data-aurora-tone={tone}
        />
        <Eyebrow srHeading={{ level: 2, text: title }}>{title}</Eyebrow>
      </header>
      <div className="aurora-timeline-section-body">{children}</div>
    </section>
  );
}

function TimelineDay({
  index,
  dayISO,
  rows,
  totalOut,
  totalIn,
  onPick,
}: {
  index: number;
  dayISO: string;
  rows: AuroraTimelineItem[];
  totalOut: number;
  totalIn: number;
  onPick: (it: AuroraTimelineItem) => void;
}) {
  const reduced = useReducedMotion();
  const label = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(dayISO));

  return (
    <motion.section
      className="aurora-activity-day"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          duration: reduced ? 0.12 : 0.34,
          delay: reduced ? 0 : index * 0.04,
          ease: [0.32, 0.72, 0, 1],
        },
      }}
    >
      <header className="aurora-activity-day-head">
        <span className="aurora-activity-day-label">{label}</span>
        <span dir="ltr" className="aurora-activity-day-totals">
          {totalIn > 0 ? (
            <span className="aurora-activity-in">+{ILS.format(totalIn)}</span>
          ) : null}
          {totalIn > 0 && totalOut > 0 ? <span aria-hidden> · </span> : null}
          {totalOut > 0 ? (
            <span className="aurora-activity-out">−{ILS.format(totalOut)}</span>
          ) : null}
        </span>
      </header>
      <ul className="aurora-activity-list">
        {rows.map((r) => (
          <li key={r.id}>
            <LedgerRow
              accent={<LaneDot color={laneColor(r)} />}
              label={<RowLabel item={r} />}
              meta={<RowMeta item={r} />}
              amount={
                <span dir="ltr">
                  {r.direction === "in" ? "+" : "−"}
                  {ILS.format(r.amount)}
                </span>
              }
              direction={
                r.direction === "in"
                  ? "in"
                  : r.origin === "projection" || r.bankPending || r.needsConfirmation
                    ? "pending"
                    : "out"
              }
              onClick={() => onPick(r)}
              ariaLabel={`פרטי ${r.label}`}
            />
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function RowLabel({ item }: { item: AuroraTimelineItem }) {
  return (
    <span className="aurora-activity-row-label">
      {item.label}
      {item.origin === "projection" ? (
        <span className="aurora-row-badge" data-aurora-tone="info">
          מתוכנן
        </span>
      ) : null}
      {item.isRefund ? (
        <span className="aurora-row-badge" data-aurora-tone="safe">
          החזר
        </span>
      ) : null}
      {(item.bankPending || item.needsConfirmation) && item.origin === "entry" ? (
        <span className="aurora-row-badge" data-aurora-tone="watch">
          ממתין
        </span>
      ) : null}
      {item.installments > 1 ? (
        <span className="aurora-row-badge" data-aurora-tone="info">
          {item.installments} תשלומים
        </span>
      ) : null}
    </span>
  );
}

function RowMeta({ item }: { item: AuroraTimelineItem }) {
  const t = new Date(item.whenISO);
  const isFuture = item.bucket === "future";
  if (isFuture) {
    const now = new Date();
    const days = Math.max(
      0,
      Math.round((t.getTime() - now.getTime()) / 86_400_000),
    );
    const when =
      days === 0
        ? "היום"
        : days === 1
          ? "מחר"
          : `בעוד ${days} ימים`;
    return <>{when} · {projectionLabel(item.projectionKind)}</>;
  }
  return <>{HOUR.format(t)} · {categoryLabel(item.category)}</>;
}

function projectionLabel(
  kind: AuroraTimelineItem["projectionKind"],
): string {
  switch (kind) {
    case "income":
      return "הכנסה";
    case "card":
      return "חיוב כרטיס";
    case "loan":
      return "תשלום הלוואה";
    case "bank_debit":
      return "חיוב בנק";
    default:
      return "אירוע";
  }
}

function TimelineDetail({
  item,
  onPickCategory,
  onDelete,
}: {
  item: AuroraTimelineItem;
  onPickCategory: () => void;
  onDelete: () => void;
}) {
  const isProjection = item.origin === "projection";
  const isDemo = item.source === "demo";
  const editable = !isProjection && !isDemo && Boolean(item.entryId);

  return (
    <div className="aurora-activity-detail">
      <div className="aurora-activity-detail-head">
        <Eyebrow>
          {isProjection ? projectionLabel(item.projectionKind) : categoryLabel(item.category)}
        </Eyebrow>
        <h2 className="aurora-activity-detail-title">{item.label}</h2>
        <span
          dir="ltr"
          className="aurora-activity-detail-amount"
          style={{
            color:
              item.direction === "in"
                ? "var(--aurora-state-safe)"
                : "var(--aurora-ink-1)",
          }}
        >
          {item.direction === "in" ? "+" : "−"}
          {ILS.format(item.amount)}
        </span>
      </div>

      <dl className="aurora-activity-detail-list">
        <Row label="מתי" value={FULL_TIME.format(new Date(item.whenISO))} />
        <Row
          label="חלון"
          value={
            item.bucket === "future"
              ? "מתוכנן"
              : item.bucket === "today"
                ? "היום"
                : "בוצע"
          }
        />
        <Row label="כיוון" value={item.direction === "in" ? "כניסה" : "יציאה"} />
        {isProjection ? (
          <Row label="סוג" value={projectionLabel(item.projectionKind)} />
        ) : (
          <Row
            label="מקור רישום"
            value={
              item.source === "auto"
                ? "אוטומטי (SMS)"
                : item.source === "manual"
                  ? "רישום ידני"
                  : item.source === "wallet"
                    ? "Apple Pay"
                    : item.source === "demo"
                      ? "תצוגת דמו"
                      : item.source
            }
          />
        )}
        {item.installments > 1 ? (
          <Row label="תשלומים" value={`${item.installments}`} />
        ) : null}
        {item.cardLast4 ? (
          <Row label="כרטיס" value={`****${item.cardLast4}`} />
        ) : null}
        {item.isRefund ? <Row label="סטטוס" value="החזר" /> : null}
        {item.bankPending ? <Row label="סטטוס" value="ממתין בבנק" /> : null}
        {item.needsConfirmation ? (
          <Row label="סטטוס" value="ממתין לאישור" />
        ) : null}
      </dl>

      {editable ? (
        <div className="aurora-activity-detail-actions">
          <button
            type="button"
            className="aurora-detail-action"
            data-aurora-variant="primary"
            onClick={onPickCategory}
          >
            שנה קטגוריה
          </button>
          <button
            type="button"
            className="aurora-detail-action"
            data-aurora-variant="danger"
            onClick={onDelete}
          >
            מחק עסקה
          </button>
        </div>
      ) : (
        <p className="aurora-activity-detail-note">
          {isProjection
            ? "פריט מתוכנן מבוסס על הכנסות, הלוואות וחיובי כרטיסים פעילים. עריכה זמינה במסך ההגדרות של הפריט המקור."
            : "זו עסקת תצוגה. עריכה ומחיקה יהיו זמינות לאחר חיבור חשבון אמיתי."}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="aurora-activity-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TimelineEmpty({ message }: { message: string }) {
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-empty-state">
        <span aria-hidden className="aurora-empty-orb" />
        <p className="aurora-body-l aurora-ink-2">{message}</p>
      </div>
    </GlassCard>
  );
}
