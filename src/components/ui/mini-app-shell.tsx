"use client";

// Phase 410 — Mini-app shell primitives.
//
// Settings folders are no longer admin lists. Each folder becomes a
// mini-app inside the existing SettingsAccordion: hero KPI strip,
// premium item cards with progress + status pills, quick-action
// chips, empty states. Same DNA as the rest of the product — gold
// CTAs, glass surfaces, RTL by default.
//
// Engine math untouched. Each mini-app reads canonical engine
// helpers and renders. Pilot consumer: LoansMiniApp.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

import { tap as hapticTap } from "@/lib/haptics";

// ────────────────────────────────────────────────────────────────────
// Hero KPI strip — sits at the top of each mini-app.
// ────────────────────────────────────────────────────────────────────

export type MiniAppKpi = {
  label: string;
  value: string;
  /** Optional secondary tone-coloured line below the value. */
  caption?: string;
  tone: string;
  /** Optional emphasis — render slightly larger for the primary KPI. */
  emphasis?: boolean;
};

export function MiniAppHero({
  title,
  subtitle,
  kpis,
}: {
  title: string;
  subtitle?: string;
  kpis: MiniAppKpi[];
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4"
      dir="rtl"
    >
      <header className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[11.5px] text-muted-foreground/80">
            {subtitle}
          </span>
        ) : null}
      </header>
      <div
        className={`grid gap-2 ${
          kpis.length === 1
            ? "grid-cols-1"
            : kpis.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        }`}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5"
            style={{ boxShadow: `inset 0 0 22px -10px ${k.tone}55` }}
          >
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {k.label}
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className={
                k.emphasis
                  ? "text-[20px] font-light leading-tight"
                  : "text-[16px] font-medium leading-tight"
              }
              style={{
                color: "#F6F6F6",
                textShadow: `0 0 18px ${k.tone}33`,
              }}
            >
              {k.value}
            </span>
            {k.caption ? (
              <span
                className="text-[10.5px]"
                style={{ color: k.tone }}
              >
                {k.caption}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Primary action chip — "+ הוסף" at the top of the list. Distinct
// from the FullScreenFooter CTA because the mini-app keeps the
// header visible while user is scrolling the list.
// ────────────────────────────────────────────────────────────────────

export function MiniAppAddCta({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        onClick();
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/[0.08] text-[13px] font-medium text-[#D4AF37] transition-colors hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/[0.12]"
      dir="rtl"
    >
      <Plus className="size-4" aria-hidden />
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Status pill — small tone-coloured badge ("פעיל" / "מסתיים בקרוב").
// ────────────────────────────────────────────────────────────────────

export function MiniAppStatusPill({
  tone,
  children,
}: {
  tone: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
      style={{
        background: `${tone}1a`,
        color: tone,
        borderColor: `${tone}55`,
      }}
    >
      {children}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// List card — premium item row with primary metric, secondary meta,
// optional progress bar, optional status pill, tap-to-edit handler.
// ────────────────────────────────────────────────────────────────────

export type MiniAppListCardProps = {
  icon?: LucideIcon;
  tone: string;
  title: string;
  /** Smaller line below the title — typically the secondary number
   *  ("נותר ₪82,000" or "כל 5 לחודש"). */
  subtitle?: string;
  /** Primary amount on the right-hand side. */
  primaryValue: string;
  /** Optional caption beneath primary value ("/חודש"). */
  primaryCaption?: string;
  /** Optional progress 0..1 (rendered as a thin bar at the bottom). */
  progress?: number;
  /** Optional progress label ("3/24 תשלומים שולמו"). */
  progressLabel?: string;
  /** Optional status pill. */
  status?: { tone: string; label: string };
  onClick?: () => void;
};

export function MiniAppListCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  primaryValue,
  primaryCaption,
  progress,
  progressLabel,
  status,
  onClick,
}: MiniAppListCardProps) {
  const tappable = typeof onClick === "function";
  return (
    <motion.button
      type="button"
      onClick={() => {
        if (!tappable) return;
        hapticTap();
        onClick?.();
      }}
      whileTap={tappable ? { scale: 0.985 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-3 text-right ${
        tappable
          ? "transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
          : ""
      }`}
      style={{ background: `linear-gradient(180deg, ${tone}08, rgba(0,0,0,0.25))` }}
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: `${tone}1f`,
                color: tone,
              }}
            >
              <Icon className="size-5" strokeWidth={1.6} />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="line-clamp-1 text-[13.5px] font-medium text-foreground">
              {title}
            </span>
            {subtitle ? (
              <span className="text-[11px] text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
            {status ? (
              <span className="mt-1 inline-flex">
                <MiniAppStatusPill tone={status.tone}>
                  {status.label}
                </MiniAppStatusPill>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[15px] font-semibold"
            style={{ color: tone }}
          >
            {primaryValue}
          </span>
          {primaryCaption ? (
            <span className="text-[10.5px] text-muted-foreground/80">
              {primaryCaption}
            </span>
          ) : null}
        </div>
      </div>

      {typeof progress === "number" ? (
        <div className="flex flex-col gap-1">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/6"
            aria-hidden
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: tone }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.max(0, Math.min(100, progress * 100))}%`,
              }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {progressLabel ? (
            <span className="text-[10px] text-muted-foreground/80">
              {progressLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </motion.button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Empty state — used inside a folder before the user adds the first
// row. Encourages action without resorting to a flat "אין נתונים".
// ────────────────────────────────────────────────────────────────────

export function MiniAppEmpty({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center"
      dir="rtl"
    >
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-2xl bg-white/5 text-muted-foreground"
      >
        <Icon className="size-7" strokeWidth={1.4} />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[14px] font-medium text-foreground">
          {title}
        </span>
        <span className="max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </div>
      {cta ? (
        <MiniAppAddCta label={cta.label} onClick={cta.onClick} />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Section divider with a small uppercase label — used inside larger
// mini-apps to separate active vs ended, for example.
// ────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────
// Status hero — single big tone-glow card. Used by Notifications +
// Shortcut mini-apps as the headline ("התראות פעילות", "Shortcut
// עובד"). Larger than a KPI tile, smaller than the full hero strip.
// ────────────────────────────────────────────────────────────────────

export function MiniAppStatusHero({
  tone,
  icon: Icon,
  title,
  detail,
}: {
  tone: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
  return (
    <section
      className="flex items-center gap-3 rounded-3xl border p-4"
      dir="rtl"
      style={{
        background: `linear-gradient(180deg, ${tone}1f 0%, rgba(0,0,0,0.25) 100%)`,
        borderColor: `${tone}55`,
        boxShadow: `0 0 28px -14px ${tone}99`,
      }}
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: `${tone}33`,
          color: tone,
          boxShadow: `0 0 18px -4px ${tone}88`,
        }}
      >
        <Icon className="size-6" strokeWidth={1.7} />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span
          className="text-[14px] font-semibold"
          style={{ color: tone }}
        >
          {title}
        </span>
        {detail ? (
          <span className="text-[11.5px] text-muted-foreground">{detail}</span>
        ) : null}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// iOS-style toggle row — icon + label + description + control.
// Used by Notifications mini-app for the four toggles.
// ────────────────────────────────────────────────────────────────────

export function MiniAppToggleRow({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/25 p-3"
      dir="rtl"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-foreground/80"
      >
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[13px] font-medium text-foreground">
          {title}
        </span>
        {description ? (
          <span className="text-[11px] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Disclosure — collapsed-by-default block for technical / rare
// content (diagnostics, advanced toggles). Same chrome as the rest
// of the mini-app body, but a quiet summary chevron.
// ────────────────────────────────────────────────────────────────────

export function MiniAppDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-2xl border border-white/8 bg-white/[0.02]">
      <summary
        className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-[12px] text-muted-foreground"
        dir="rtl"
      >
        <span>{label}</span>
        <span className="text-[10px] text-muted-foreground/70">פתח</span>
      </summary>
      <div className="border-t border-white/8 p-3" dir="rtl">
        {children}
      </div>
    </details>
  );
}

export function MiniAppSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-1.5" dir="rtl">
      <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-white/6" />
    </div>
  );
}
