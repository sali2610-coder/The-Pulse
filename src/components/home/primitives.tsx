"use client";

// Home v2 · Shared visual primitives.
//
// UI-only atoms. No engine, no store, no data model touched. Every
// primitive is a thin wrapper around token-driven CSS classes so the
// visual language stays consistent across sections.

import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { type ReactNode } from "react";

// ── Eyebrow ───────────────────────────────────────────────────
// Uppercase mini-label with tracking. Ink-4 by default; gold-soft
// when marked as accent (single hero-eyebrow ritual).

export function Eyebrow({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`sally-eyebrow${accent ? " sally-eyebrow-accent" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </span>
  );
}

// ── HairlineShelf ─────────────────────────────────────────────
// A short gold hairline that breathes over 6s. Wordmark of the
// Signature Hero + priority marker for LIVE checkpoint.

export function HairlineShelf({
  width = 88,
  className,
}: {
  width?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={`sally-hairline-shelf${className ? ` ${className}` : ""}`}
      style={{ width }}
      initial={{ opacity: reduced ? 1 : 0.6 }}
      animate={
        reduced
          ? { opacity: 1 }
          : { opacity: [0.6, 1, 0.6] }
      }
      transition={{
        duration: reduced ? 0.12 : 6,
        repeat: reduced ? 0 : Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

// ── GoldSentence ──────────────────────────────────────────────
// One editorial line — Heebo Light, gold-soft tone. Frames Hebrew
// low-quotes automatically. Never used more than once per screen.

export function GoldSentence({ children }: { children: string }) {
  return (
    <p className="sally-gold-sentence" dir="rtl">
      {`„${children.trim().replace(/^[„"'']+|[„"'']+$/g, "")}"`}
    </p>
  );
}

// ── SectionHeader ─────────────────────────────────────────────
// Eyebrow + end-side total. Used to open every Layer-2 section.

export function SectionHeader({
  eyebrow,
  end,
}: {
  eyebrow: string;
  end?: ReactNode;
}) {
  return (
    <header className="sally-section-header">
      <Eyebrow>{eyebrow}</Eyebrow>
      {end ? <span className="sally-section-header-end">{end}</span> : null}
    </header>
  );
}

// ── LedgerRow ─────────────────────────────────────────────────
// Universal row. No card chrome, hairline top only. Tap zone
// enlarges to the whole row.

export function LedgerRow({
  label,
  meta,
  amount,
  amountTone,
  onClick,
  ariaLabel,
  leading,
}: {
  label: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  amountTone?: "safe" | "danger" | "watch" | "ink";
  onClick?: () => void;
  ariaLabel?: string;
  leading?: ReactNode;
}) {
  const body = (
    <div className="sally-ledger-body">
      {leading ? <span className="sally-ledger-leading">{leading}</span> : null}
      <div className="sally-ledger-text">
        <span className="sally-ledger-label">{label}</span>
        {meta ? <span className="sally-ledger-meta">{meta}</span> : null}
      </div>
      <span
        dir="ltr"
        className="sally-ledger-amount"
        data-aurora-tone={amountTone ?? "ink"}
      >
        {amount}
      </span>
    </div>
  );
  if (!onClick) {
    return <div className="sally-ledger-row">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="sally-ledger-row sally-ledger-row-button"
    >
      {body}
    </button>
  );
}

// ── GlassCard ─────────────────────────────────────────────────
// Elevated glass container used only for the Hero and Checkpoint
// rail. Every other section is chromeless.

export function GlassCard({
  children,
  variant = "shelf",
  className,
  onClick,
  ariaLabel,
  motionProps,
}: {
  children: ReactNode;
  variant?: "shelf" | "hero";
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  motionProps?: MotionProps;
}) {
  const combined = `sally-glass sally-glass-${variant}${
    className ? ` ${className}` : ""
  }`;
  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={combined}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        {...motionProps}
      >
        {children}
      </motion.button>
    );
  }
  return (
    <motion.div className={combined} {...motionProps}>
      {children}
    </motion.div>
  );
}

// ── Hairline ──────────────────────────────────────────────────
// Consistent 1px divider. Never used inside GlassCard-hero.

export function Hairline({ className }: { className?: string }) {
  return (
    <div className={`sally-hairline-divider${className ? ` ${className}` : ""}`} aria-hidden />
  );
}
