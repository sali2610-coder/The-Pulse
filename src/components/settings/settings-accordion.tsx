"use client";

// Phase 231 — Settings-scoped collapsible group.
//
// Lighter than DashboardSection (which is bento-grid coupled).
// Uses the same dashboard-section-store for collapse persistence so
// the user's toggles survive reload. Defaults to collapsed because
// Settings sections are stable navigation surfaces, not active info.

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { tap } from "@/lib/haptics";
import {
  readSectionCollapsed,
  subscribeCollapseState,
  writeSectionCollapsed,
} from "@/lib/dashboard-section-store";

export function SettingsAccordion({
  storageKey,
  title,
  subtitle,
  icon,
  defaultCollapsed = true,
  children,
  /** Phase 332 — opt-in mutex mode. When mutexOpenKey is provided
   *  the accordion is controlled by the parent: it's open iff
   *  mutexOpenKey === storageKey. Toggling fires onMutexToggle with
   *  either storageKey (open) or null (close). Persistence is still
   *  driven by the same dashboard-section-store so reload restores
   *  whichever section was last open. */
  mutexOpenKey,
  onMutexToggle,
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
  mutexOpenKey?: string | null;
  onMutexToggle?: (next: string | null) => void;
}) {
  const mutex = mutexOpenKey !== undefined && onMutexToggle !== undefined;
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  useEffect(() => {
    if (mutex) return;
    let cancelled = false;
    const pull = () => {
      Promise.resolve().then(() => {
        if (!cancelled)
          setCollapsed(readSectionCollapsed(storageKey, defaultCollapsed));
      });
    };
    pull();
    const unsub = subscribeCollapseState(pull);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [storageKey, defaultCollapsed, mutex]);

  const effectiveCollapsed = mutex
    ? mutexOpenKey !== storageKey
    : collapsed;

  function toggle() {
    tap();
    if (mutex) {
      const next = mutexOpenKey === storageKey ? null : storageKey;
      onMutexToggle(next);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    writeSectionCollapsed(storageKey, next);
  }

  return (
    <section
      className={`group overflow-hidden rounded-2xl border bg-surface/50 backdrop-blur-md transition-shadow ${
        effectiveCollapsed
          ? "border-border/60 hover:border-white/15"
          : "border-[color:var(--neon)]/30 shadow-[0_0_0_1px_color-mix(in_srgb,var(--neon)_20%,transparent),0_20px_50px_-30px_color-mix(in_srgb,var(--neon)_40%,transparent)]"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!effectiveCollapsed}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/2"
      >
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span
              className={`flex size-7 items-center justify-center rounded-xl transition-colors ${
                effectiveCollapsed
                  ? "bg-white/5 text-[color:var(--neon)]"
                  : "bg-[color:var(--neon)]/15 text-[color:var(--neon)]"
              }`}
            >
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">{title}</span>
            {subtitle ? (
              <span className="text-caption text-muted-foreground/85">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>
        <motion.span
          animate={{ rotate: effectiveCollapsed ? 0 : 180 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {!effectiveCollapsed ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-white/8 p-4">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
