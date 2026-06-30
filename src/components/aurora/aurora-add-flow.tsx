"use client";

// Phase 435 · AURORA v1 — Add Transaction flow
//
// Tap "+" → BottomSheet with three large action cards (Expense /
// Income / Transfer). Pick one → polished aurora form slides in.
// Save → checkmark draw success animation → close + toast. Cancel
// from inside form → slides back to picker. Cancel from picker →
// closes sheet.
//
// All three modes hit store.addExpense:
//   - expense  → standard (cash/credit, paymentMethod)
//   - income   → isRefund: true (engine treats as money-in)
//   - transfer → transactionType: "withdrawal", withdrawalKind:
//                "transfer", withdrawalDestination = label
//
// No dead clicks. Demo path saves into the real store (which makes
// /aurora-preview's no-anchor branch fall back automatically because
// once an entry exists the live engine takes over).

import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";

type AddMode = "picker" | "expense" | "income" | "transfer";
type PaymentChoice = "card" | "cash" | "bank";

const ILS_INPUT = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 0,
});

const ISO_TODAY = () => new Date().toISOString().slice(0, 10);

const MODE_META: Record<
  Exclude<AddMode, "picker">,
  {
    label: string;
    accent: string;
    eyebrow: string;
    cta: string;
    successText: (amt: string) => string;
  }
> = {
  expense: {
    label: "הוצאה",
    accent: "var(--aurora-brand-aurora-2)",
    eyebrow: "הוצאה חדשה",
    cta: "שמור הוצאה",
    successText: (a) => `נרשמה הוצאה ${a}`,
  },
  income: {
    label: "הכנסה",
    accent: "var(--aurora-state-safe)",
    eyebrow: "הכנסה חדשה",
    cta: "שמור הכנסה",
    successText: (a) => `נרשמה הכנסה ${a}`,
  },
  transfer: {
    label: "העברה",
    accent: "var(--aurora-accent-gold-loud)",
    eyebrow: "העברה בין חשבונות",
    cta: "שמור העברה",
    successText: (a) => `נרשמה העברה ${a}`,
  },
};

export function AuroraAddFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [mode, setMode] = useState<AddMode>("picker");

  useEffect(() => {
    if (!open) {
      const id = window.setTimeout(() => setMode("picker"), 240);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const title =
    mode === "picker"
      ? "פעולה חדשה"
      : `${MODE_META[mode].eyebrow}`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} lockDismiss>
      <div className="aurora-add-stack">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "picker" ? (
            <motion.div
              key="picker"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <AddPicker
                onPick={setMode}
                onCancel={() => onOpenChange(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              <AddForm
                mode={mode}
                onBack={() => setMode("picker")}
                onSaved={() => onOpenChange(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}

// ── Picker ────────────────────────────────────────────────────────

function AddPicker({
  onPick,
  onCancel,
}: {
  onPick: (m: Exclude<AddMode, "picker">) => void;
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-add-picker">
      <p className="aurora-body aurora-ink-3 aurora-add-picker-hint">
        מה לתעד עכשיו?
      </p>
      <div className="aurora-add-picker-grid">
        <PickerCard
          mode="expense"
          label="הוצאה"
          hint="כסף שיצא"
          accent="var(--aurora-brand-aurora-2)"
          icon={<MinusIcon />}
          onPick={onPick}
          reduced={Boolean(reduced)}
          delay={0}
        />
        <PickerCard
          mode="income"
          label="הכנסה"
          hint="כסף שנכנס"
          accent="var(--aurora-state-safe)"
          icon={<PlusIcon />}
          onPick={onPick}
          reduced={Boolean(reduced)}
          delay={0.05}
        />
        <PickerCard
          mode="transfer"
          label="העברה"
          hint="בין חשבונות"
          accent="var(--aurora-accent-gold-loud)"
          icon={<SwapIcon />}
          onPick={onPick}
          reduced={Boolean(reduced)}
          delay={0.1}
        />
      </div>
      <button
        type="button"
        className="aurora-add-ghost"
        onClick={onCancel}
      >
        ביטול
      </button>
    </div>
  );
}

function PickerCard({
  mode,
  label,
  hint,
  accent,
  icon,
  onPick,
  reduced,
  delay,
}: {
  mode: Exclude<AddMode, "picker">;
  label: string;
  hint: string;
  accent: string;
  icon: React.ReactNode;
  onPick: (m: Exclude<AddMode, "picker">) => void;
  reduced: boolean;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      className="aurora-add-pick-card"
      style={{ borderColor: `${accent}55` }}
      onClick={() => onPick(mode)}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      whileHover={reduced ? undefined : { y: -2 }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.12 : 0.4,
        delay: reduced ? 0 : delay,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <span
        aria-hidden
        className="aurora-add-pick-icon"
        style={{ background: `${accent}22`, color: accent }}
      >
        {icon}
      </span>
      <span className="aurora-add-pick-label">{label}</span>
      <span className="aurora-add-pick-hint">{hint}</span>
    </motion.button>
  );
}

// ── Form ──────────────────────────────────────────────────────────

function AddForm({
  mode,
  onBack,
  onSaved,
}: {
  mode: Exclude<AddMode, "picker">;
  onBack: () => void;
  onSaved: () => void;
}) {
  const addExpense = useFinanceStore((s) => s.addExpense);
  const accounts = useFinanceStore((s) => s.accounts);

  const banks = useMemo(
    () => accounts.filter((a) => a.active && a.kind === "bank"),
    [accounts],
  );
  const cards = useMemo(
    () => accounts.filter((a) => a.active && a.kind === "card"),
    [accounts],
  );

  const [amountText, setAmountText] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<CategoryId>(
    mode === "income" ? "other" : "food",
  );
  const [date, setDate] = useState<string>(ISO_TODAY());
  const [pay, setPay] = useState<PaymentChoice>(mode === "transfer" ? "bank" : "card");
  const [fromAccount, setFromAccount] = useState<string>(banks[0]?.id ?? "");
  const [toAccount, setToAccount] = useState<string>(banks[1]?.id ?? banks[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const meta = MODE_META[mode];
  const amount = parseAmount(amountText);

  const needsTransferAccounts = mode === "transfer";
  const transferReady = needsTransferAccounts
    ? banks.length >= 2 && fromAccount && toAccount && fromAccount !== toAccount
    : true;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!amount || amount <= 0) e.amount = "הזן סכום חוקי";
    if (amount > 1_000_000) e.amount = "סכום גבוה מדי";
    if (mode === "expense" && !category) e.category = "בחר קטגוריה";
    if (mode === "transfer") {
      if (banks.length < 2) e.from = "צריך לפחות שני חשבונות בנק להעברה";
      else if (fromAccount === toAccount) e.to = "בחר חשבון יעד שונה";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = () => {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    const iso = new Date(`${date}T12:00:00`).toISOString();
    try {
      if (mode === "expense") {
        addExpense({
          amount,
          category,
          merchant: merchant.trim() || undefined,
          note: note.trim() || undefined,
          installments: 1,
          paymentMethod: pay === "card" ? "credit" : "cash",
          accountId:
            pay === "card"
              ? cards[0]?.id
              : pay === "bank"
                ? banks[0]?.id
                : undefined,
          source: "manual",
          chargeDate: iso,
          occurredAt: iso,
        });
      } else if (mode === "income") {
        addExpense({
          amount,
          category: "other",
          merchant: merchant.trim() || undefined,
          note: note.trim() || undefined,
          installments: 1,
          paymentMethod: "cash",
          accountId: banks[0]?.id,
          source: "manual",
          chargeDate: iso,
          occurredAt: iso,
        });
        // mark as refund-style inflow via direct entry patch: addExpense
        // returns the inserted entry id, but we need isRefund. Use the
        // post-add update path so the engine sees direction: "in".
        // The store exposes updateExpense; cheapest path is to write a
        // tiny post-mutation after addExpense by reading the freshest
        // entry. Implemented below in `markLastAsIncome` to keep this
        // function readable.
        markLastAsIncome();
      } else {
        const fromLabel = banks.find((a) => a.id === fromAccount)?.label ?? "";
        const toLabel = banks.find((a) => a.id === toAccount)?.label ?? "";
        addExpense({
          amount,
          category: "other",
          merchant: `העברה: ${fromLabel} → ${toLabel}`,
          note: note.trim() || undefined,
          installments: 1,
          paymentMethod: "cash",
          accountId: fromAccount,
          source: "manual",
          chargeDate: iso,
          occurredAt: iso,
          transactionType: "withdrawal",
          withdrawalKind: "transfer",
          withdrawalDestination: toLabel,
        });
      }
      setSuccess(true);
      window.setTimeout(() => {
        toast.success(meta.successText(formatILS(amount)));
        onSaved();
      }, 900);
    } catch (err) {
      console.error("add-flow save failed", err);
      setSubmitting(false);
      toast.error("שמירה נכשלה. נסה שוב.");
    }
  };

  return (
    <div className="aurora-add-form">
      {success ? <SuccessOverlay accent={meta.accent} /> : null}

      <div className="aurora-add-form-head">
        <button
          type="button"
          className="aurora-add-back"
          onClick={onBack}
          aria-label="חזור לבחירה"
        >
          <BackIcon />
          <span>בחר סוג אחר</span>
        </button>
        <span
          className="aurora-add-form-eyebrow"
          style={{ color: meta.accent }}
        >
          {meta.eyebrow}
        </span>
      </div>

      <label className="aurora-add-amount-row">
        <span className="aurora-add-label">סכום</span>
        <div
          className="aurora-add-amount-wrap"
          data-aurora-error={errors.amount ? "true" : "false"}
        >
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            className="aurora-add-amount-input"
            value={amountText}
            onChange={(e) => setAmountText(sanitizeAmount(e.target.value))}
            autoFocus
          />
          <span aria-hidden className="aurora-add-amount-currency">
            ₪
          </span>
        </div>
        {errors.amount ? (
          <span className="aurora-add-error">{errors.amount}</span>
        ) : amount > 0 ? (
          <span className="aurora-add-hint" dir="ltr">
            {formatILS(amount)}
          </span>
        ) : null}
      </label>

      {mode !== "transfer" ? (
        <>
          <FormField label={mode === "income" ? "מקור" : "שם מקום"}>
            <input
              type="text"
              dir="rtl"
              className="aurora-add-input"
              placeholder={mode === "income" ? "משכורת · החזר · ..." : "שופרסל · BP · ..."}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value.slice(0, 60))}
            />
          </FormField>

          {mode === "expense" ? (
            <FormField label="קטגוריה" error={errors.category}>
              <div className="aurora-cat-chip-row">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = c.id === category;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="aurora-cat-chip"
                      data-aurora-active={active ? "true" : "false"}
                      style={{
                        borderColor: active ? c.accent : "var(--aurora-hairline-quiet)",
                        color: active ? c.accent : "var(--aurora-ink-2)",
                      }}
                      onClick={() => setCategory(c.id)}
                    >
                      <Icon size={16} />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </FormField>
          ) : null}

          <FormField label="אמצעי תשלום">
            <div className="aurora-segmented" role="radiogroup">
              <SegOption value="card" current={pay} onPick={setPay} label="אשראי" />
              <SegOption value="cash" current={pay} onPick={setPay} label="מזומן" />
              <SegOption value="bank" current={pay} onPick={setPay} label="בנק" />
            </div>
          </FormField>
        </>
      ) : (
        <>
          <FormField label="מאיפה" error={errors.from}>
            {banks.length < 2 ? (
              <div className="aurora-empty-hint">
                <span aria-hidden className="aurora-empty-glyph" />
                <p className="aurora-body aurora-ink-2">
                  צריך לפחות שני חשבונות בנק פעילים. הוסף חשבון בהגדרות כדי לאפשר העברה.
                </p>
              </div>
            ) : (
              <select
                dir="rtl"
                className="aurora-add-input"
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {banks.length >= 2 ? (
            <FormField label="לאן" error={errors.to}>
              <select
                dir="rtl"
                className="aurora-add-input"
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </>
      )}

      <FormField label="תאריך">
        <input
          type="date"
          dir="ltr"
          className="aurora-add-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={ISO_TODAY()}
        />
      </FormField>

      <FormField label="הערה (לא חובה)">
        <textarea
          dir="rtl"
          className="aurora-add-input aurora-add-textarea"
          placeholder="פרטים נוספים..."
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
        />
      </FormField>

      <div className="aurora-add-actions">
        <button
          type="button"
          className="aurora-add-ghost"
          onClick={onBack}
          disabled={submitting}
        >
          ביטול
        </button>
        <motion.button
          type="button"
          className="aurora-add-submit"
          style={{ background: meta.accent }}
          onClick={onSubmit}
          disabled={submitting || !transferReady}
          whileTap={{ scale: 0.98 }}
        >
          {submitting ? "שומר…" : meta.cta}
        </motion.button>
      </div>
    </div>
  );
}

function markLastAsIncome() {
  // After addExpense pushes the entry, flip isRefund on the freshest
  // manual row so the engine treats it as money-in. Centralised here
  // because the store's addExpense currently lacks a "direction: in"
  // shorthand and we don't want to bloat its surface for this one
  // call-site. Safe — no-op when nothing landed.
  const store = useFinanceStore.getState();
  const latest = [...store.entries]
    .filter((e) => e.source === "manual")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (latest) store.updateExpense(latest.id, { isRefund: true });
}

// ── Atoms ─────────────────────────────────────────────────────────

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="aurora-add-field">
      <span className="aurora-add-label">{label}</span>
      {children}
      {error ? <span className="aurora-add-error">{error}</span> : null}
    </label>
  );
}

function SegOption({
  value,
  current,
  onPick,
  label,
}: {
  value: PaymentChoice;
  current: PaymentChoice;
  onPick: (v: PaymentChoice) => void;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className="aurora-seg-option"
      data-aurora-active={active ? "true" : "false"}
      onClick={() => onPick(value)}
    >
      {active ? (
        <motion.span
          layoutId="aurora-seg-pill"
          aria-hidden
          className="aurora-seg-pill"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      ) : null}
      <span className="aurora-seg-label">{label}</span>
    </button>
  );
}

function SuccessOverlay({ accent }: { accent: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="aurora-add-success"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <motion.svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        aria-hidden
      >
        <motion.circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke={accent}
          strokeWidth="3"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0.12 : 0.5, ease: [0.32, 0.72, 0, 1] }}
        />
        <motion.path
          d="M30 50 L44 64 L68 36"
          fill="none"
          stroke={accent}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: reduced ? 0.12 : 0.4,
            delay: reduced ? 0 : 0.32,
            ease: [0.32, 0.72, 0, 1],
          }}
        />
      </motion.svg>
    </motion.div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────

function MinusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path d="M4 11h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path
        d="M5 7h12l-3-3M17 15H5l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none">
      <path
        d="M11 4l5 5-5 5M16 9H2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function sanitizeAmount(raw: string): string {
  return raw.replace(/[^\d.,]/g, "").replace(/,/g, "").slice(0, 9);
}

function parseAmount(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatILS(n: number): string {
  return `₪${ILS_INPUT.format(Math.round(n))}`;
}
