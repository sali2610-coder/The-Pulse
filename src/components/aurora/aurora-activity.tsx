"use client";

// Phase 433 · AURORA v1 — AuroraActivity screen
//
// Full month transactions feed. Same shell/glass/RTL discipline as
// AuroraHome. Anatomy:
//   1. Summary header   — month label + total out / in / count
//   2. Search field     — debounced filter by label/category
//   3. Filter chips     — all · out · in · refund · pending
//   4. Day-grouped list — sticky day header w/ daily totals
//   5. Detail sheet     — opens on row tap
//   6. Empty state      — polished glyph + hint

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

import {
  applyFilter,
  useAuroraActivity,
  type AuroraActivityFilter,
  type AuroraActivityItem,
} from "./use-aurora-activity";

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

const FILTERS: Array<{ key: AuroraActivityFilter; label: string }> = [
  { key: "all", label: "הכל" },
  { key: "out", label: "הוצאות" },
  { key: "in", label: "הכנסות" },
  { key: "refund", label: "החזרים" },
  { key: "pending", label: "ממתינות" },
];

function laneColor(item: AuroraActivityItem): string {
  if (item.isRefund || item.direction === "in") return "var(--aurora-state-safe)";
  if (item.isWithdrawal) return "var(--aurora-lane-cash)";
  if (item.bankPending || item.needsConfirmation) return "var(--aurora-state-watch)";
  if (item.paySource === "credit") return "var(--aurora-lane-card)";
  return "var(--aurora-lane-bank)";
}

function categoryLabel(catId: string): string {
  try {
    const cat = getCategory(catId as Parameters<typeof getCategory>[0]);
    return cat?.label ?? catId;
  } catch {
    return catId;
  }
}

export function AuroraActivity() {
  const data = useAuroraActivity();
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const restoreExpense = useFinanceStore((s) => s.restoreExpense);
  const entries = useFinanceStore((s) => s.entries);
  const [filter, setFilter] = useState<AuroraActivityFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuroraActivityItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        ? {
            label: "בטל",
            onClick: () => restoreExpense(original),
          }
        : undefined,
    });
  };

  const filteredItems = useMemo(
    () => applyFilter(data.items, filter, query),
    [data.items, filter, query],
  );
  const filteredDays = useMemo(() => {
    const map = new Map<string, AuroraActivityItem[]>();
    for (const it of filteredItems) {
      const key = it.whenISO.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dayISO, rows]) => {
        const totalOut = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
        const totalIn = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
        return { dayISO, rows, totalOut, totalIn };
      });
  }, [filteredItems]);

  return (
    <div className="aurora-activity-stack">
      <h1 className="sr-only">עסקאות החודש</h1>

      <ActivitySummary
        monthLabel={data.monthLabel}
        totalOut={data.totalOut}
        totalIn={data.totalIn}
        count={data.count}
        isDemo={data.isDemo}
      />

      <div className="aurora-activity-search">
        <input
          type="search"
          inputMode="search"
          dir="rtl"
          placeholder="חיפוש לפי שם או קטגוריה…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="חיפוש בעסקאות"
          className="aurora-activity-input"
        />
      </div>

      <ActivityFilterRow filter={filter} onChange={setFilter} />

      {filteredDays.length === 0 ? (
        <ActivityEmpty
          message={
            query.length > 0
              ? `אין תוצאות עבור "${query}".`
              : "אין עסקאות לסינון שבחרת החודש."
          }
        />
      ) : (
        <div className="aurora-activity-days">
          {filteredDays.map((d, idx) => (
            <ActivityDay
              key={d.dayISO}
              index={idx}
              dayISO={d.dayISO}
              totalOut={d.totalOut}
              totalIn={d.totalIn}
              rows={d.rows}
              onPick={setSelected}
            />
          ))}
        </div>
      )}

      <BottomSheet
        open={selected !== null}
        onOpenChange={(o) => (o ? null : closeDetail())}
        title={selected?.label ?? ""}
      >
        {selected ? (
          <ActivityDetail
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
        <CategoryPicker
          activeId={(selected?.category ?? "other") as CategoryId}
          onPick={handleChangeCategory}
        />
      </BottomSheet>
    </div>
  );
}

function ActivitySummary({
  monthLabel,
  totalOut,
  totalIn,
  count,
  isDemo,
}: {
  monthLabel: string;
  totalOut: number;
  totalIn: number;
  count: number;
  isDemo: boolean;
}) {
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 2, text: `עסקאות ${monthLabel}` }}>
          עסקאות · {monthLabel}
        </Eyebrow>
        {isDemo ? (
          <span aria-hidden className="aurora-demo-pill">
            תצוגת דמו
          </span>
        ) : null}
      </div>
      <div className="aurora-activity-summary-grid">
        <SummaryCell label="הוצאות" amount={totalOut} tone="var(--aurora-ink-1)" />
        <SummaryCell label="הכנסות" amount={totalIn} tone="var(--aurora-state-safe)" />
        <SummaryCell label="פעולות" amount={count} tone="var(--aurora-ink-2)" suffix=" " noCurrency />
      </div>
    </GlassCard>
  );
}

function SummaryCell({
  label,
  amount,
  tone,
  suffix,
  noCurrency,
}: {
  label: string;
  amount: number;
  tone: string;
  suffix?: string;
  noCurrency?: boolean;
}) {
  return (
    <div className="aurora-activity-summary-cell">
      <Eyebrow>{label}</Eyebrow>
      <span dir="ltr" className="aurora-activity-summary-amount" style={{ color: tone }}>
        {noCurrency ? amount.toLocaleString("he-IL") : ILS.format(amount)}
        {suffix ?? ""}
      </span>
    </div>
  );
}

function ActivityFilterRow({
  filter,
  onChange,
}: {
  filter: AuroraActivityFilter;
  onChange: (f: AuroraActivityFilter) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      role="tablist"
      aria-label="סינון עסקאות"
      className="aurora-activity-filters"
    >
      {FILTERS.map((f) => {
        const active = f.key === filter;
        return (
          <motion.button
            key={f.key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(f.key)}
            className="aurora-filter-chip"
            data-aurora-active={active ? "true" : "false"}
            whileTap={reduced ? undefined : { scale: 0.96 }}
          >
            {f.label}
          </motion.button>
        );
      })}
    </div>
  );
}

function ActivityDay({
  index,
  dayISO,
  totalOut,
  totalIn,
  rows,
  onPick,
}: {
  index: number;
  dayISO: string;
  totalOut: number;
  totalIn: number;
  rows: AuroraActivityItem[];
  onPick: (it: AuroraActivityItem) => void;
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
          duration: reduced ? 0.12 : 0.36,
          delay: reduced ? 0 : index * 0.04,
          ease: [0.32, 0.72, 0, 1],
        },
      }}
    >
      <header className="aurora-activity-day-head">
        <span className="aurora-activity-day-label">{label}</span>
        <span dir="ltr" className="aurora-activity-day-totals">
          {totalIn > 0 ? <span className="aurora-activity-in">+{ILS.format(totalIn)}</span> : null}
          {totalIn > 0 && totalOut > 0 ? <span aria-hidden> · </span> : null}
          {totalOut > 0 ? <span className="aurora-activity-out">−{ILS.format(totalOut)}</span> : null}
        </span>
      </header>
      <ul className="aurora-activity-list">
        {rows.map((r) => (
          <li key={r.id}>
            <LedgerRow
              accent={<LaneDot color={laneColor(r)} />}
              label={
                <ActivityRowLabel item={r} />
              }
              meta={
                <ActivityRowMeta item={r} />
              }
              amount={
                <span dir="ltr">
                  {r.direction === "in" ? "+" : "−"}
                  {ILS.format(r.amount)}
                </span>
              }
              direction={
                r.direction === "in"
                  ? "in"
                  : r.bankPending || r.needsConfirmation
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

function ActivityRowLabel({ item }: { item: AuroraActivityItem }) {
  return (
    <span className="aurora-activity-row-label">
      {item.label}
      {item.isRefund ? (
        <span className="aurora-row-badge" data-aurora-tone="safe">
          החזר
        </span>
      ) : null}
      {item.bankPending || item.needsConfirmation ? (
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

function ActivityRowMeta({ item }: { item: AuroraActivityItem }) {
  const parts: string[] = [];
  parts.push(HOUR.format(new Date(item.whenISO)));
  parts.push(categoryLabel(item.category));
  return <>{parts.join(" · ")}</>;
}

function ActivityDetail({
  item,
  onPickCategory,
  onDelete,
}: {
  item: AuroraActivityItem;
  onPickCategory: () => void;
  onDelete: () => void;
}) {
  const isDemo = item.source === "demo";
  return (
    <div className="aurora-activity-detail">
      <div className="aurora-activity-detail-head">
        <Eyebrow>{categoryLabel(item.category)}</Eyebrow>
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
        <Row label="כיוון" value={item.direction === "in" ? "כניסה" : "יציאה"} />
        <Row label="מקור" value={paySourceLabel(item.paySource)} />
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
                    : "אוטומטי"
          }
        />
        {item.installments > 1 ? (
          <Row label="תשלומים" value={`${item.installments}`} />
        ) : null}
        {item.isRefund ? <Row label="סטטוס" value="החזר" /> : null}
        {item.bankPending ? <Row label="סטטוס" value="ממתין בבנק" /> : null}
        {item.needsConfirmation ? (
          <Row label="סטטוס" value="ממתין לאישור" />
        ) : null}
      </dl>

      <div className="aurora-activity-detail-actions">
        <button
          type="button"
          className="aurora-detail-action"
          data-aurora-variant="primary"
          onClick={onPickCategory}
          disabled={isDemo}
        >
          שנה קטגוריה
        </button>
        <button
          type="button"
          className="aurora-detail-action"
          data-aurora-variant="danger"
          onClick={onDelete}
          disabled={isDemo}
        >
          מחק עסקה
        </button>
      </div>
      {isDemo ? (
        <p className="aurora-activity-detail-note">
          זו עסקת תצוגה. עריכה ומחיקה יהיו זמינות אחרי שתחבר חשבון אמיתי.
        </p>
      ) : null}
    </div>
  );
}

function CategoryPicker({
  activeId,
  onPick,
}: {
  activeId: CategoryId;
  onPick: (id: CategoryId) => void;
}) {
  return (
    <ul className="aurora-cat-picker" role="listbox">
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <button
              type="button"
              className="aurora-cat-picker-item"
              role="option"
              aria-selected={active}
              data-aurora-active={active ? "true" : "false"}
              onClick={() => onPick(c.id)}
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

function paySourceLabel(p: AuroraActivityItem["paySource"]): string {
  switch (p) {
    case "income":
      return "הכנסה";
    case "credit":
      return "כרטיס אשראי";
    case "cash":
      return "מזומן";
    case "bank":
      return "חיוב בנק";
    case "wallet":
      return "Apple Pay";
    default:
      return p;
  }
}

function ActivityEmpty({ message }: { message: string }) {
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-empty-state">
        <span aria-hidden className="aurora-empty-orb" />
        <p className="aurora-body-l aurora-ink-2">{message}</p>
      </div>
    </GlassCard>
  );
}
