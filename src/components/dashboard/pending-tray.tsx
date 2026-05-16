"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronLeft, Bell } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getCategory } from "@/lib/categories";
import { tap } from "@/lib/haptics";
import { ConfirmationSheet } from "@/components/confirmation/confirmation-sheet";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

function pendingTimeLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "כעת";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "כעת";
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} ד׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} ש׳`;
  const day = Math.floor(hr / 24);
  return `לפני ${day} ימים`;
}

export function PendingTray() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const pending = useFinanceStore((s) =>
    s.entries.filter((e) => e.needsConfirmation && !e.confirmedAt),
  );

  const [active, setActive] = useState<ExpenseEntry | null>(null);

  if (!hydrated || pending.length === 0) return null;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="glass-card-pending animate-pending-pulse relative overflow-hidden rounded-3xl p-5"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--neon)]/40 to-transparent" />

        <header className="flex items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--neon)]/15 text-[color:var(--neon)]">
              <Bell className="h-5 w-5" strokeWidth={1.7} />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[color:var(--neon)] shadow-[0_0_8px_var(--neon)]" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-[0.24em] text-[color:var(--neon)]">
                ממתינים לאישור
              </span>
              <span className="text-lg font-semibold text-foreground">
                {pending.length === 1
                  ? "חיוב חדש"
                  : `${pending.length} חיובים חדשים`}
              </span>
            </div>
          </div>
          <Sparkles
            className="h-5 w-5 text-[color:var(--neon)]/60"
            strokeWidth={1.4}
          />
        </header>

        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {pending.map((entry) => {
              const cat = getCategory(entry.category);
              const Icon = cat.icon;
              return (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 26,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      tap();
                      setActive(entry);
                    }}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-surface/50 p-3 text-start transition-all hover:-translate-y-0.5 hover:border-[color:var(--neon)]/40 hover:bg-surface/70 active:scale-[0.99]"
                  >
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        background: `${cat.accent}1f`,
                        color: cat.accent,
                      }}
                    >
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </span>

                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="line-clamp-1 text-base font-medium text-foreground">
                        {entry.merchant?.trim() || "עסק לא ידוע"}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{pendingTimeLabel(entry.createdAt)}</span>
                        {entry.cardLast4 && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span dir="ltr">····{entry.cardLast4}</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        dir="ltr"
                        className="font-mono text-lg font-semibold text-foreground"
                      >
                        {ILS.format(entry.amount)}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-[color:var(--neon)] group-hover:translate-x-[-2px] transition-transform">
                        אישור
                        <ChevronLeft
                          className="h-3.5 w-3.5"
                          strokeWidth={2}
                        />
                      </span>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </motion.section>

      {active && (
        <ConfirmationSheet
          key={active.id}
          open={Boolean(active)}
          onOpenChange={(v) => {
            if (!v) setActive(null);
          }}
          entry={active}
        />
      )}
    </>
  );
}
