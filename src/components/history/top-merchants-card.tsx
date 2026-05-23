"use client";

// 12-month top-merchants leaderboard. Lives in History tab.
// Different from the dashboard's per-month MerchantRow surface
// (lib/merchants.ts) — that one is "where did the food category
// go THIS month"; this one is "what are my real annual habits".

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { topMerchantsAnnual } from "@/lib/top-merchants";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function TopMerchantsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const stats = useMemo(() => {
    if (!hydrated) return [];
    return topMerchantsAnnual({ entries, limit: 10 });
  }, [hydrated, entries]);

  if (!hydrated) return null;
  if (stats.length === 0) return null;

  const max = Math.max(...stats.map((s) => s.netTotal), 1);

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Crown className="size-3 text-gold" />
          Top Merchants · 12 חודשים
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {stats.length} ראשונים
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {stats.map((s, idx) => {
          const pct = Math.max(2, Math.round((s.netTotal / max) * 100));
          return (
            <motion.li
              key={s.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(idx, 8) * STAGGER_TIGHT,
                duration: 0.22,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="w-5 shrink-0 text-end text-[10px] text-muted-foreground tabular-nums">
                {idx + 1}
              </span>
              <span className="w-28 shrink-0 truncate text-foreground">
                {s.label}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="absolute inset-y-0 start-0 rounded-full"
                  style={{
                    width: `${pct}%`,
                    background:
                      "linear-gradient(90deg, var(--neon), color-mix(in oklab, var(--neon) 40%, transparent))",
                  }}
                />
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="w-20 shrink-0 text-end text-[11px] text-muted-foreground"
              >
                {ILS.format(s.netTotal)}
              </span>
              <span
                className="w-10 shrink-0 text-end text-[10px] text-muted-foreground/80"
                data-mono="true"
                dir="ltr"
              >
                ×{s.chargeCount}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
