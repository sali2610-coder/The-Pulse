"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { topMerchants } from "@/lib/merchants";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function TopMerchantsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return topMerchants({ entries, monthKey: currentMonthKey(), limit: 6 });
  }, [hydrated, entries]);

  if (!hydrated || rows.length === 0) return null;

  const max = Math.max(1, ...rows.map((r) => r.total));
  const total = rows.reduce((a, r) => a + r.total, 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <Trophy className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            עסקים מובילים · החודש
          </span>
          <span className="text-base font-semibold text-foreground">
            {rows.length === 1 ? "עסק 1" : `${rows.length} עסקים`} ·{" "}
            <span dir="ltr" className="font-mono text-muted-foreground">
              {ILS.format(total)}
            </span>
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {rows.map((row, idx) => {
            const meta = getCategory(row.category);
            const Icon = meta.icon;
            const widthPct = (row.total / max) * 100;
            return (
              <motion.li
                key={row.key}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.025 }}
                className="relative overflow-hidden rounded-2xl border border-white/8 bg-surface/50 p-3"
              >
                {/* Bar background */}
                <motion.div
                  aria-hidden
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{
                    delay: 0.25 + idx * 0.03,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                  className="absolute inset-y-0 right-0 origin-right"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${meta.accent}1f)`,
                  }}
                />

                <div className="relative flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: `${meta.accent}1f`,
                      color: meta.accent,
                    }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="line-clamp-1 text-sm font-medium text-foreground">
                      {row.merchant}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {meta.label} · {row.count} חיובים
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    data-mono="true"
                    className="text-sm font-semibold text-foreground"
                  >
                    {ILS.format(row.total)}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
