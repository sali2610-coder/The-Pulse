"use client";

// Phase 409 — shared full-screen edit shell.
//
// Extracts the visual DNA of expense-edit-fullscreen.tsx so every
// Add / Edit surface in the system can adopt the same premium feel
// without copy-pasting the layout:
//
//   • Full-screen sheet (BottomSheet fullScreen + lockDismiss).
//   • Centered hero icon + hero amount input.
//   • Field-row list inside a single rounded panel.
//   • Sticky footer with a gold-gradient primary CTA and an optional
//     destructive button beneath.
//   • RTL-safe by default. iOS safe-area inset baked in.
//
// Each migrated screen wires its own state + actions and feeds the
// primitives below. NO engine math is touched.

import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Minus, Plus, Trash2, X } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap } from "@/lib/haptics";
import { SPRING_BOUNCE, SPRING_SHARP } from "@/lib/motion-tokens";

/** Debounce window in ms — a second tap on the primary CTA within
 *  this window is ignored. Prevents duplicate saves (double-add,
 *  double-mutation) from a fast double-tap or an accidental
 *  synthetic click. */
const PRIMARY_DEBOUNCE_MS = 700;

// ────────────────────────────────────────────────────────────────────
// Shell wrapper
// ────────────────────────────────────────────────────────────────────

export function FullScreenEditShell({
  open,
  onOpenChange,
  title,
  children,
  hasDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** When true, close confirms before discarding — used by consumers
   *  that let the user type input and don't want an accidental tap
   *  on ❌ to blow away a half-filled draft. */
  hasDraft?: boolean;
}) {
  function confirmClose() {
    if (hasDraft) {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("לזרוק את השינויים בטיוטה?");
      if (!ok) return;
    }
    onOpenChange(false);
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      fullScreen
      lockDismiss
      noHandle
    >
      <div className="flex h-full min-h-0 flex-col gap-4" dir="rtl">
        {/* Top bar — always visible ❌ close in the corner + centered
           title. Consumers can also render their own hero below. */}
        <div className="fs-topbar">
          <button
            type="button"
            className="fs-close"
            onClick={confirmClose}
            aria-label="סגור"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
          <span className="fs-topbar-title">{title}</span>
          <span aria-hidden className="fs-topbar-spacer" />
        </div>
        {children}
      </div>
    </BottomSheet>
  );
}

// ────────────────────────────────────────────────────────────────────
// Hero: icon + amount block. The icon tone drives the amount glow.
// ────────────────────────────────────────────────────────────────────

export function FullScreenHero({
  icon: Icon,
  tone,
  label,
  amount,
  onAmountChange,
  amountLabel = "סכום",
  amountReadOnly = false,
  subtitle,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  amount: string;
  onAmountChange?: (v: string) => void;
  amountLabel?: string;
  amountReadOnly?: boolean;
  /** Optional supporting sentence rendered under the label. Turns
   *  the hero from an icon-only header into a Premium Composer
   *  header with a short "why am I here" line. */
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-5 pt-2" dir="rtl">
      <div className="flex flex-col items-center gap-2">
        <motion.span
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING_BOUNCE}
          className="flex size-24 items-center justify-center rounded-3xl"
          style={{
            background: `linear-gradient(180deg, ${tone}26, ${tone}0f)`,
            color: tone,
            boxShadow: `0 0 44px -14px ${tone}77, 0 1px 0 rgba(255,255,255,0.06) inset`,
          }}
          aria-hidden
        >
          <Icon className="size-12" strokeWidth={1.4} />
        </motion.span>
        <span className="text-[12.5px] uppercase tracking-[0.3em] text-muted-foreground">
          {label}
        </span>
        {subtitle ? (
          <span className="max-w-[32ch] text-center text-[12.5px] leading-relaxed text-muted-foreground/85">
            {subtitle}
          </span>
        ) : null}
      </div>

      <div
        className="fs-hero-amount"
        data-tone-color
        style={{ ["--fs-tone" as string]: tone }}
      >
        <label className="fs-hero-amount-frame" htmlFor="fs-hero-amount-input">
          <span className="fs-hero-amount-currency" aria-hidden>
            ₪
          </span>
          <input
            id="fs-hero-amount-input"
            inputMode="decimal"
            value={amount}
            onChange={
              onAmountChange
                ? (e) => onAmountChange(e.target.value.replace(/[^\d.]/g, ""))
                : undefined
            }
            readOnly={amountReadOnly || !onAmountChange}
            aria-label={amountLabel}
            data-mono="true"
            placeholder="0"
            dir="ltr"
            autoComplete="off"
            className="fs-hero-amount-input"
          />
        </label>
        <span className="fs-hero-amount-label">
          {amount.trim().length === 0 ? "הקלד סכום" : amountLabel}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Field list — divided panel of FieldRow children.
// ────────────────────────────────────────────────────────────────────

export function FullScreenFieldList({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-white/6 rounded-2xl border border-white/8 bg-white/[0.02]">
      {children}
    </ul>
  );
}

export function FieldRow({
  label,
  stacked,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  if (stacked) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <span className="text-[12.5px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        {children}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-[13.5px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span className="flex flex-1 justify-end">{children}</span>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────
// Chips: bank / card / account / source picker.
// ────────────────────────────────────────────────────────────────────

export function FullScreenChipRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string; sublabel?: string }>;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {options.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              hapticTap();
              onChange(c.id);
            }}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
            style={{
              color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
              background: active
                ? "linear-gradient(180deg,#F6D970 0%,#D4AF37 100%)"
                : "transparent",
              borderColor: active ? "transparent" : "rgba(255,255,255,0.14)",
            }}
          >
            {c.label}
            {c.sublabel ? ` ${c.sublabel}` : ""}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Stepper — numeric +/- control reused for installments, day of
// month, etc.
// ────────────────────────────────────────────────────────────────────

export function FullScreenStepper({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  ariaLabel?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-1.5 py-1"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.max(min, value - 1));
        }}
        aria-label="פחות"
        className="inline-flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
      >
        <Minus className="size-3" aria-hidden />
      </button>
      <span
        data-mono="true"
        dir="ltr"
        className="min-w-7 text-center text-[13px] text-foreground tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.min(max, value + 1));
        }}
        aria-label="עוד"
        className="inline-flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
      >
        <Plus className="size-3" aria-hidden />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Segmented control — generic 2-3 option toggle (cash/credit,
// recurring/installment, etc.). Same gold-pill aesthetic as the
// expense edit's payment toggle.
// ────────────────────────────────────────────────────────────────────

export function FullScreenSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layoutId,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  layoutId: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative inline-flex rounded-full border border-white/10 bg-black/35 p-1 text-[12px]"
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className="relative inline-flex h-7 items-center justify-center rounded-full px-3 transition-colors"
            style={{
              color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
            }}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(180deg,#F6D970 0%,#D4AF37 100%)",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
                }}
                transition={SPRING_SHARP}
              />
            ) : null}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sticky footer with primary CTA + optional destructive secondary.
// ────────────────────────────────────────────────────────────────────

export function FullScreenFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  destructiveLabel,
  onDestructive,
  disabledReason,
  cancelLabel,
  onCancel,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  destructiveLabel?: string;
  onDestructive?: () => void;
  /** Short sentence explaining WHY the primary CTA is disabled.
   *  Rendered as a muted line above the button so the user always
   *  knows what's missing. */
  disabledReason?: string;
  /** Optional secondary "בטל" ghost button placed beside the
   *  primary CTA. When passed, the primary occupies the majority
   *  of the row and cancel takes ~30%. */
  cancelLabel?: string;
  onCancel?: () => void;
}) {
  // Double-save guard. Fast double-taps on the primary CTA used
  // to fire two store mutations (double addRule / addLoan /
  // addIncome / addExpense) — visible in the list as duplicated
  // rows. Timestamp-based debounce is cheaper than a busy state
  // + doesn't need consumers to opt in.
  const lastPrimaryAt = useRef(0);
  const lastDestructiveAt = useRef(0);
  const lastCancelAt = useRef(0);

  function handlePrimary() {
    const now = Date.now();
    if (now - lastPrimaryAt.current < PRIMARY_DEBOUNCE_MS) return;
    lastPrimaryAt.current = now;
    hapticTap();
    onPrimary();
  }
  function handleCancel() {
    if (!onCancel) return;
    const now = Date.now();
    if (now - lastCancelAt.current < 300) return;
    lastCancelAt.current = now;
    hapticTap();
    onCancel();
  }
  function handleDestructive() {
    if (!onDestructive) return;
    const now = Date.now();
    if (now - lastDestructiveAt.current < PRIMARY_DEBOUNCE_MS) return;
    lastDestructiveAt.current = now;
    hapticTap();
    onDestructive();
  }

  return (
    <div
      className="fs-footer"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
    >
      {primaryDisabled && disabledReason ? (
        <p className="fs-footer-hint">{disabledReason}</p>
      ) : null}
      <div className="fs-footer-row">
        {cancelLabel && onCancel ? (
          <button
            type="button"
            onClick={handleCancel}
            className="fs-cancel"
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handlePrimary}
          disabled={primaryDisabled}
          aria-label={primaryLabel}
          className="fs-primary"
        >
          {primaryLabel}
        </button>
      </div>
      {destructiveLabel && onDestructive ? (
        <button
          type="button"
          onClick={handleDestructive}
          className="fs-destructive"
          aria-label={destructiveLabel}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {destructiveLabel}
        </button>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Body scroll wrapper — keeps the field list scrollable above the
// sticky footer on small screens.
// ────────────────────────────────────────────────────────────────────

export function FullScreenBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-col gap-5 pb-4">{children}</div>
    </div>
  );
}
