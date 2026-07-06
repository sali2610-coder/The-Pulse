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

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Minus, Plus, Trash2, X } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap } from "@/lib/haptics";

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
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
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

      <div className="flex flex-col items-center gap-1 pb-1">
        <div
          className="flex items-baseline gap-1 text-foreground"
          dir="ltr"
        >
          <input
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
            className="w-56 bg-transparent text-center text-[52px] font-light leading-none tracking-tight outline-none ring-0"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: tone,
              textShadow: `0 0 28px ${tone}44`,
            }}
          />
          <span className="text-[26px] text-muted-foreground">₪</span>
        </div>
        <span className="text-[11.5px] uppercase tracking-[0.3em] text-muted-foreground">
          {amountLabel}
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
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
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
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  destructiveLabel?: string;
  onDestructive?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 border-t border-white/8 pt-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onPrimary();
        }}
        disabled={primaryDisabled}
        aria-label={primaryLabel}
        className="fs-primary h-14 rounded-2xl text-[16px] font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
          color: "#1A140A",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 28px -8px rgba(212,175,55,0.65)",
        }}
      >
        {primaryLabel}
      </button>
      {destructiveLabel && onDestructive ? (
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onDestructive();
          }}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] text-red-400 transition-colors hover:text-red-300"
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
