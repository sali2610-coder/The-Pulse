"use client";

// Phase 440 · AURORA recovery — Pending Transactions Center
//
// Surfaces every entry where the user must confirm/reject (Wallet
// partials, SMS rows whose parse left a gap, anything marked
// needsConfirmation). UI-only consumer of existing store mutations:
//   - confirmExpense(id, patch?)   — approve and persist edits
//   - dismissPending(id)           — reject ("not mine")
// No engine math touched. No new financial behavior added.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES, getCategory, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import type { ExpenseEntry } from "@/types/finance";

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

function isPendingNow(e: ExpenseEntry): boolean {
  if (e.confirmedAt) return false;
  return Boolean(e.needsConfirmation || e.bankPending);
}

function pendingReason(e: ExpenseEntry): string {
  if (e.bankPending) return "ממתין באישור הבנק";
  if (e.needsConfirmation) return "ממתין לאישור שלך";
  return "ממתין";
}

function pendingIcon(e: ExpenseEntry): string {
  if (e.source === "auto" || e.source === "sms") return "SMS";
  if (e.source === "wallet") return "Wallet";
  return "ידני";
}

function safeCategoryLabel(id: string): string {
  try {
    return getCategory(id as CategoryId).label;
  } catch {
    return id;
  }
}

function safeCategoryAccent(id: string): string {
  try {
    return getCategory(id as CategoryId).accent;
  } catch {
    return "#94A3B8";
  }
}

// ── Pulse card on Home ────────────────────────────────────────────

export function PendingPulseCard() {
  const entries = useFinanceStore((s) => s.entries);
  const pending = useMemo(
    () => entries.filter(isPendingNow),
    [entries],
  );
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  if (pending.length === 0) {
    return null;
  }

  const total = pending.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="aurora-pending-cta"
        aria-label="פתח עסקאות ממתינות"
      >
        <GlassCard elevation="elev-1" padding="comfortable" radius="hero">
          <div className="aurora-pending-cta-body">
            <span
              aria-hidden
              className="aurora-pending-dot"
              style={{ background: "var(--aurora-state-watch)" }}
            />
            <div className="aurora-pending-cta-text">
              <Eyebrow>ממתינות לאישור</Eyebrow>
              <span className="aurora-pending-cta-title">
                {pending.length} עסקאות · {ILS.format(total)}
              </span>
              <span className="aurora-pending-cta-hint">
                תקיש כדי לאשר / לדחות אחת אחת.
              </span>
            </div>
            <motion.span
              aria-hidden
              className="aurora-pending-cta-arrow"
              animate={reduced ? undefined : { x: [0, 4, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              ←
            </motion.span>
          </div>
        </GlassCard>
      </button>

      <PendingSheet open={open} onOpenChange={setOpen} entries={pending} />
    </>
  );
}

// ── Sheet ────────────────────────────────────────────────────────

function PendingSheet({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  entries: ExpenseEntry[];
}) {
  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);
  const restoreExpense = useFinanceStore((s) => s.restoreExpense);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => entries.find((e) => e.id === activeId) ?? null,
    [entries, activeId],
  );

  // Auto-close once the queue empties.
  if (open && entries.length === 0) {
    return null;
  }

  const handleApprove = (id: string, patch?: { category?: CategoryId }) => {
    confirmExpense(id, patch);
    setActiveId(null);
    toast.success("העסקה אושרה");
  };

  const handleReject = (entry: ExpenseEntry) => {
    dismissPending(entry.id);
    setActiveId(null);
    toast(`נדחתה: ${entry.merchant ?? entry.note ?? "עסקה"}`, {
      action: {
        label: "בטל",
        onClick: () => restoreExpense(entry),
      },
    });
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="עסקאות ממתינות לאישור"
      lockDismiss
    >
      <div className="aurora-pending-sheet">
        <header className="aurora-pending-sheet-head">
          <Eyebrow srHeading={{ level: 2, text: "עסקאות ממתינות לאישור" }}>
            תיבת אישורים
          </Eyebrow>
          <span className="aurora-body aurora-ink-3">
            {entries.length} ממתינות · אישור משאיר את העסקה ב-Pulse, דחייה מסירה אותה.
          </span>
        </header>

        {active ? (
          <PendingDetail
            entry={active}
            onApprove={(patch) => handleApprove(active.id, patch)}
            onReject={() => handleReject(active)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <ul className="aurora-pending-list">
            {entries.map((e) => (
              <PendingRow
                key={e.id}
                entry={e}
                onPick={() => setActiveId(e.id)}
                onApprove={() => handleApprove(e.id)}
                onReject={() => handleReject(e)}
              />
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

function PendingRow({
  entry,
  onPick,
  onApprove,
  onReject,
}: {
  entry: ExpenseEntry;
  onPick: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const reduced = useReducedMotion();
  const accent = safeCategoryAccent(entry.category as string);
  return (
    <motion.li
      className="aurora-pending-row"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.32, ease: [0.32, 0.72, 0, 1] }}
    >
      <button
        type="button"
        className="aurora-pending-row-body"
        onClick={onPick}
        aria-label={`פתח פרטי ${entry.merchant ?? entry.note ?? "עסקה"}`}
      >
        <span
          aria-hidden
          className="aurora-pending-row-dot"
          style={{ background: accent }}
        />
        <div className="aurora-pending-row-text">
          <span className="aurora-pending-row-title">
            {entry.merchant ?? entry.note ?? "ללא שם"}
          </span>
          <span className="aurora-pending-row-meta">
            {pendingReason(entry)} · {pendingIcon(entry)} · {safeCategoryLabel(entry.category as string)}
          </span>
        </div>
        <span dir="ltr" className="aurora-pending-row-amount">
          {ILS.format(entry.amount)}
        </span>
      </button>
      <div className="aurora-pending-row-actions">
        <button
          type="button"
          className="aurora-pending-action"
          data-aurora-variant="approve"
          onClick={onApprove}
          aria-label="אשר עסקה"
        >
          ✓
        </button>
        <button
          type="button"
          className="aurora-pending-action"
          data-aurora-variant="reject"
          onClick={onReject}
          aria-label="דחה עסקה"
        >
          ×
        </button>
      </div>
    </motion.li>
  );
}

function PendingDetail({
  entry,
  onApprove,
  onReject,
  onBack,
}: {
  entry: ExpenseEntry;
  onApprove: (patch?: { category?: CategoryId }) => void;
  onReject: () => void;
  onBack: () => void;
}) {
  const [pickedCategory, setPickedCategory] = useState<CategoryId>(
    entry.category as CategoryId,
  );
  const accent = safeCategoryAccent(pickedCategory);

  return (
    <div className="aurora-pending-detail">
      <button
        type="button"
        className="aurora-add-back"
        onClick={onBack}
        aria-label="חזור לתיבה"
      >
        ←
        <span>חזור לרשימה</span>
      </button>

      <div className="aurora-pending-detail-head">
        <Eyebrow>{pendingReason(entry)}</Eyebrow>
        <h2 className="aurora-activity-detail-title">
          {entry.merchant ?? entry.note ?? "עסקה ממתינה"}
        </h2>
        <span
          dir="ltr"
          className="aurora-activity-detail-amount"
          style={{ color: accent }}
        >
          {ILS.format(entry.amount)}
        </span>
      </div>

      <dl className="aurora-activity-detail-list">
        {entry.chargeDate ? (
          <Row label="מתי" value={FULL_TIME.format(new Date(entry.chargeDate))} />
        ) : null}
        <Row label="מקור" value={pendingIcon(entry)} />
        <Row label="קטגוריה נוכחית" value={safeCategoryLabel(entry.category as string)} />
        {entry.installments > 1 ? (
          <Row label="תשלומים" value={`${entry.installments}`} />
        ) : null}
        {entry.cardLast4 ? <Row label="כרטיס" value={`****${entry.cardLast4}`} /> : null}
      </dl>

      <div className="aurora-pending-cat-section">
        <Eyebrow>אפשר לשנות קטגוריה לפני האישור</Eyebrow>
        <ul className="aurora-cat-picker" role="listbox">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const isActive = c.id === pickedCategory;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="aurora-cat-picker-item"
                  role="option"
                  aria-selected={isActive}
                  data-aurora-active={isActive ? "true" : "false"}
                  onClick={() => setPickedCategory(c.id)}
                >
                  <span
                    aria-hidden
                    className="aurora-cat-picker-icon"
                    style={{ background: `${c.accent}28`, color: c.accent }}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="aurora-cat-picker-label">{c.label}</span>
                  {isActive ? (
                    <span aria-hidden className="aurora-cat-picker-check">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="aurora-pending-detail-actions">
        <button
          type="button"
          className="aurora-detail-action"
          data-aurora-variant="danger"
          onClick={onReject}
        >
          דחה את העסקה
        </button>
        <button
          type="button"
          className="aurora-detail-action"
          data-aurora-variant="primary"
          onClick={() =>
            onApprove(
              pickedCategory !== entry.category
                ? { category: pickedCategory }
                : undefined,
            )
          }
        >
          אשר עסקה
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="aurora-activity-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

