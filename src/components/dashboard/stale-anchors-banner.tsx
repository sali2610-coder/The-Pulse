"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { detectStaleAnchors } from "@/lib/anchor-staleness";
import { navigateToTab } from "@/lib/tab-nav";
import { tap } from "@/lib/haptics";

const TONES = {
  alert: { fg: "#F87171", border: "border-[#F87171]/40", bg: "bg-[#F87171]/8" },
  watch: { fg: "#D4AF37", border: "border-[#D4AF37]/40", bg: "bg-[#D4AF37]/8" },
} as const;

/**
 * Surfaces bank accounts whose anchorBalance hasn't been refreshed
 * recently. The CFO forecast is only as accurate as the anchor; a
 * 30-day-old anchor will silently make EOM projections wrong.
 *
 * Tap any row → deep-link to the accounts settings section so the
 * user can punch in a fresh number.
 */
export function StaleAnchorsBanner() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);

  const stale = useMemo(() => {
    if (!hydrated) return [];
    return detectStaleAnchors({ accounts });
  }, [hydrated, accounts]);

  if (!hydrated) return null;
  if (stale.length === 0) return null;

  function goToAccounts() {
    tap();
    navigateToTab("settings", "accounts");
  }

  return (
    <section className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {stale.slice(0, 3).map((s) => {
          const tone = TONES[s.severity];
          return (
            <motion.button
              key={s.accountId}
              type="button"
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 8 }}
              whileTap={{ scale: 0.985 }}
              onClick={goToAccounts}
              className={`flex items-center gap-2.5 rounded-2xl border p-3 text-start outline-none transition-colors ${tone.border} ${tone.bg} focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60`}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${tone.fg}22`, color: tone.fg }}
              >
                {s.severity === "alert" ? (
                  <AlertTriangle className="size-4" strokeWidth={1.8} />
                ) : (
                  <RefreshCcw className="size-4" strokeWidth={1.8} />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: tone.fg }}
                  >
                    יתרת בנק לא עדכנית
                  </span>
                </div>
                <div className="text-[12.5px] font-medium text-foreground">
                  {s.label} — עודכן לפני {s.daysSinceUpdate} ימים
                </div>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: `${tone.fg}22`, color: tone.fg }}
              >
                רענן
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
