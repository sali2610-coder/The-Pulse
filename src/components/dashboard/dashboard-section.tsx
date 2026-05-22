"use client";

// Collapsible bento section header.
//
// Wraps a group of dashboard cards under a labeled header that the
// user can collapse/expand. Collapse state persists in localStorage
// per `storageKey`, so toggles survive reload + cross-tab via the
// existing Zustand persist storage layer.
//
// Designed for the premium dashboard hierarchy — reduces vertical
// noise from cards the user already understands while keeping
// every insight one tap away.

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { tap } from "@/lib/haptics";
import {
  readSectionCollapsed,
  writeSectionCollapsed,
} from "@/lib/dashboard-section-store";

export type DashboardSectionProps = {
  /** Stable identifier — DO NOT rename in place. Used as the
   *  localStorage key for the collapse state. */
  storageKey: string;
  title: string;
  icon?: ReactNode;
  /** Initial state when the user hasn't toggled this section yet. */
  defaultCollapsed?: boolean;
  /** Short helper line under the title — kept terse so the header
   *  stays one row tall. */
  subtitle?: string;
  children: ReactNode;
};

export function DashboardSection({
  storageKey,
  title,
  icon,
  defaultCollapsed = false,
  subtitle,
  children,
}: DashboardSectionProps) {
  // Initialise to the default; flip to the persisted value on mount.
  // Avoids reading localStorage during the SSR render so hydration
  // matches.
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  useEffect(() => {
    // Defer to a microtask so React's effect-vs-setState lint doesn't
    // flag the synchronous setState as state-in-effect.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setCollapsed(readSectionCollapsed(storageKey, defaultCollapsed));
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, defaultCollapsed]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeSectionCollapsed(storageKey, next);
    tap();
  };

  return (
    <section className="sm:col-span-6 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-surface/40 px-4 py-3 text-right transition-colors hover:border-white/16"
      >
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex size-7 items-center justify-center rounded-xl bg-white/5 text-[color:var(--neon)]">
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.25em] text-foreground/85">
              {title}
            </span>
            {subtitle ? (
              <span className="text-[10px] text-muted-foreground/80">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>
        <motion.span
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 gap-2.5 overflow-hidden sm:grid-cols-6 sm:gap-3"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
