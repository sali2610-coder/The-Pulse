"use client";

// Phase 429 — Quiet Concierge primitives for the Home tab.
//
// Pure presentational layer. Reads NO store / engine state directly.
// Every section composes these into ledger rows + air gaps + a single
// breath / accent at a time. No icons in the rendered output of any
// closed-surface primitive; icons are only allowed inside SpringDrawer
// content per the constitution.
//
// Review-driven invariants (Phase 429 review):
//   M3/M4 — breath is CSS keyframes, NOT rAF + setState; zero JS
//   while idle, automatically pauses with prefers-reduced-motion.
//   M5    — LedgerRow tappable variant renders <button> with <span>
//           children only; no <div> nested in a button.
//   M6    — no <style jsx>; all focus rings + animations live in
//           globals.css under the .home-* class namespace.

import { type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// ── HomeShell — the only Home surface ──────────────────────────────

export function HomeShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="home-shell relative isolate min-h-[100svh] overflow-x-hidden"
      style={{ background: "var(--home-bg)" }}
      dir="rtl"
    >
      <NeonBloom />
      <main
        className="relative z-10 mx-auto flex w-full flex-col"
        style={{
          maxWidth: "var(--home-content-max)",
          paddingInline: "var(--home-gutter)",
          paddingBlockStart: "clamp(2rem, 8vh, 5rem)",
          paddingBlockEnd: "clamp(4rem, 12vh, 8rem)",
        }}
      >
        {children}
      </main>
    </div>
  );
}

// ── NeonBloom — top-right radial glow at 8% ─────────────────────────

export function NeonBloom() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[60vh]"
      style={{
        background:
          "radial-gradient(60% 60% at 88% 0%, var(--ink-radial) 0%, transparent 72%)",
      }}
    />
  );
}

// ── SectionAir — vertical air between sections, no chrome ──────────

export function SectionAir({
  size = "xl",
  children,
}: {
  size?: "md" | "lg" | "xl" | "hero";
  children: ReactNode;
}) {
  const sizeToken = {
    md: "var(--air-md)",
    lg: "var(--air-lg)",
    xl: "var(--air-xl)",
    hero: "var(--air-hero-exhale)",
  }[size];
  return (
    <section
      style={{ paddingBlockStart: sizeToken }}
      className="flex flex-col"
    >
      {children}
    </section>
  );
}

// ── Eyebrow + HomeHeading ──────────────────────────────────────────

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        fontSize: "var(--type-eyebrow)",
        letterSpacing: "var(--tracking-eyebrow)",
        color: "var(--ink-eyebrow)",
        textTransform: "uppercase",
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      {children}
    </div>
  );
}

export function HomeHeading({
  level = 2,
  children,
}: {
  level?: 1 | 2 | 3;
  children: ReactNode;
}) {
  const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
  return <Tag className="sr-only">{children}</Tag>;
}

// ── ConciergeSentence — Gold italic, explicit variant ──────────────
//
// Variant is explicit per caller; no implicit registry. Hero uses
// "soft"; the dedicated Concierge note section uses "loud". Honors
// the single-loud-Gold-per-viewport rule via discipline at the
// composition layer rather than runtime registry (review H1 + H2).

export function ConciergeSentence({
  children,
  variant = "loud",
}: {
  children: ReactNode;
  variant?: "loud" | "soft";
}) {
  const tone =
    variant === "loud"
      ? "var(--accent-gold-loud)"
      : "var(--accent-gold-soft)";
  return (
    <p
      style={{
        color: tone,
        fontStyle: "italic",
        fontSize: "var(--type-body)",
        lineHeight: 1.45,
        letterSpacing: "0.005em",
        maxWidth: "38ch",
      }}
    >
      {children}
    </p>
  );
}

// ── DigitOdometer — whole-number crossfade, dir=ltr enforced ───────
//
// AnimatePresence keys on `value`. Reduced motion → 120ms opacity
// crossfade only. Wrapper carries aria-label; visual content is
// aria-hidden so screen readers announce once per real change.

export function DigitOdometer({
  value,
  className,
  ariaLabel,
}: {
  value: string;
  className?: string;
  ariaLabel?: string;
}) {
  const reduced = useReducedMotion();
  // Phase 429 review-fix: dropped non-standard role="text" (ARIA 1.2
   // does not define it; only VoiceOver supports it). aria-label on
   // the wrapper is sufficient for SR announcement.
  return (
    <span
      aria-label={ariaLabel}
      className={className}
      dir="ltr"
      style={{
        position: "relative",
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        minWidth: "1ch",
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          aria-hidden
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(0.4em)" }
          }
          animate={
            reduced
              ? { opacity: 1, transition: { duration: 0.12 } }
              : {
                  opacity: 1,
                  transform: "translateY(0)",
                  transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] },
                }
          }
          exit={
            reduced
              ? { opacity: 0, transition: { duration: 0.12 } }
              : {
                  opacity: 0,
                  transform: "translateY(-0.4em)",
                  transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
                }
          }
          style={{ display: "inline-block" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ── HomeStateRoot — host class so .home-* CSS scopes correctly ─────

export function HomeStateRoot({ children }: { children: ReactNode }) {
  return <div className="home-root">{children}</div>;
}

// ── NeonAccent — single soft dot. Always quiet. No JS animation. ───
//
// Removed the breath/registry dependency per review M3+M4. The
// breath now lives only on the BreathingCaret (one place at a time,
// CSS-driven).

export function NeonAccent({ size = 8 }: { size?: number }) {
  // Phase 429 review-fix: dropped boxShadow glow — a static dot
  // glowing competes with the BreathingCaret and violates "single
  // Neon accent per viewport". Dots are now flat, info-only.
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-neon)",
        opacity: 0.72,
      }}
    />
  );
}

// ── BreathingCaret — CSS-only 6s sine breath, GPU-cheap ────────────

export function BreathingCaret({ width = 96 }: { width?: number }) {
  return (
    <span
      aria-hidden
      className="home-breath-caret"
      style={{
        display: "block",
        height: 2,
        width,
        marginInline: "auto",
        marginBlockStart: 4,
        background: "var(--accent-neon)",
        borderRadius: 999,
      }}
    />
  );
}

// ── LedgerRow — right-plumb data row, optional tap ─────────────────
//
// All inner elements are <span> so the tappable variant can wrap
// them in <button> without nesting block-level into interactive.

export function LedgerRow({
  label,
  meta,
  amount,
  amountTone = "primary",
  accent,
  onClick,
  ariaLabel,
}: {
  label: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  amountTone?: "primary" | "body" | "danger";
  accent?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const amountColor =
    amountTone === "danger"
      ? "var(--lane-danger)"
      : amountTone === "body"
        ? "var(--ink-body)"
        : "var(--ink-primary)";
  const inner = (
    <span
      className="home-row-inner flex items-baseline justify-between"
      style={{
        minHeight: "var(--row-tap-min)",
        paddingBlock: "0.5rem",
      }}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        {accent}
        <span
          className="truncate"
          style={{
            color: "var(--ink-body)",
            fontSize: "var(--type-body)",
            letterSpacing: "var(--tracking-body)",
            lineHeight: 1.45,
          }}
        >
          {label}
        </span>
        {meta ? (
          <span
            className="truncate"
            style={{
              // Phase 429 review-fix: meta carries real content
              // (dates, last-out label) so it must use
              // --ink-secondary (56% — passes WCAG AA), not the
              // decorative --ink-eyebrow (32%).
              color: "var(--ink-secondary)",
              fontSize: "var(--type-eyebrow)",
              letterSpacing: "var(--tracking-eyebrow)",
              textTransform: "uppercase",
              fontWeight: 500,
              lineHeight: 1,
              marginInlineStart: "0.5rem",
            }}
          >
            {meta}
          </span>
        ) : null}
      </span>
      <span
        dir="ltr"
        style={{
          color: amountColor,
          fontSize: "var(--type-amount)",
          fontWeight: 300,
          letterSpacing: "var(--tracking-body)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {amount}
      </span>
    </span>
  );
  if (!onClick) {
    return <span className="block">{inner}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="home-tappable block w-full text-start"
    >
      {inner}
    </button>
  );
}

// ── GhostCta — inline action, hairline underline ────────────────────

export function GhostCta({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="home-ghost-cta inline-flex items-center justify-center"
      style={{
        fontSize: "var(--type-body)",
        letterSpacing: "var(--tracking-body)",
        lineHeight: 1,
        paddingBlock: "0.625rem",
        paddingInline: "0.875rem",
        borderRadius: 999,
      }}
    >
      {children}
    </button>
  );
}

// ── GoldPill — Gold italic CTA, only when content earns it ─────────

export function GoldPill({
  onClick,
  children,
  ariaLabel,
}: {
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="home-gold-pill inline-flex items-center gap-2"
      style={{
        background:
          "linear-gradient(180deg, var(--gold-grad-from) 0%, var(--gold-grad-to) 100%)",
        color: "var(--gold-grad-ink)",
        fontStyle: "italic",
        fontSize: "var(--type-body)",
        fontWeight: 600,
        paddingBlock: "0.625rem",
        paddingInline: "1rem",
        borderRadius: 999,
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </button>
  );
}

// ── SpringDrawer — downward push, no backdrop-filter on Home ──────

export function SpringDrawer({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="drawer"
          initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={
            reduced
              ? { opacity: 1, transition: { duration: 0.12 } }
              : {
                  height: "auto",
                  opacity: 1,
                  transition: { type: "spring", stiffness: 380, damping: 38 },
                }
          }
          exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
          style={{ overflow: "hidden" }}
        >
          <div className="pt-3">{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ── EmptyDash — em-dash placeholder ────────────────────────────────

export function EmptyDash() {
  return (
    <span aria-hidden style={{ color: "var(--ink-eyebrow)" }}>
      —
    </span>
  );
}
