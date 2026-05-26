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
  writeSectionCollapsed,
} from "@/lib/dashboard-section-store";

export function SettingsAccordion({
  storageKey,
  title,
  subtitle,
  icon,
  defaultCollapsed = true,
  children,
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled)
        setCollapsed(readSectionCollapsed(storageKey, defaultCollapsed));
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, defaultCollapsed]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeSectionCollapsed(storageKey, next);
    tap();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-surface/50 backdrop-blur-md">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-4 text-start transition-colors hover:bg-white/2"
      >
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span className="flex size-8 items-center justify-center rounded-xl bg-white/5 text-[color:var(--neon)]">
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
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-5" />
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
