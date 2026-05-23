"use client";

// Per-bank burn velocity. Different from forecastByAccount
// (which is one-month-out, anchor + income vs obligations) —
// this is a 28-day rate-of-change view answering "at the
// CURRENT pace, how many days until this anchor hits zero".
// Auto-hides when no active bank has a velocity to report.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Banknote, TrendingDown } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { bankVelocities, type BankVelocity } from "@/lib/anchor-velocity";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtDays(d: number): string {
  if (!Number.isFinite(d)) return "∞";
  if (d >= 365) return `${Math.round(d / 30)} חודשים`;
  if (d >= 30) return `${(d / 30).toFixed(1)} חודשים`;
  if (d >= 1) return `${Math.round(d)} ימים`;
  return "מתחת ליום";
}

function tone(v: BankVelocity): string {
  if (v.trend === "stable") return "#A1A1AA";
  if (!Number.isFinite(v.daysToZero)) return "#34D399";
  if (v.daysToZero >= 90) return "#34D399";
  if (v.daysToZero >= 30) return "#D4AF37";
  if (v.daysToZero >= 14) return "#F5A742";
  return "#F87171";
}

export function BankVelocityCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const entries = useFinanceStore((s) => s.entries);

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return bankVelocities({ accounts, entries });
  }, [hydrated, accounts, entries]);

  if (!hydrated) return null;
  const meaningful = rows.filter((r) => r.anchorBalance > 0);
  if (meaningful.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Banknote className="size-3 text-[color:var(--neon)]" />
          קצב שריפה לפי חשבון
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          חלון 28 ימים
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {meaningful.map((v, idx) => {
          const t = tone(v);
          return (
            <motion.li
              key={v.accountId}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.22,
                ease: EASE_OUT_EXPO,
              }}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 p-3 text-[11px]"
            >
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-foreground">{v.label}</span>
                <span
                  className="text-[10px] text-muted-foreground"
                  dir="ltr"
                  data-mono="true"
                >
                  {ILS.format(v.anchorBalance)} · {ILS.format(v.weeklySpend)} / שבוע
                </span>
              </div>
              <div
                className="flex shrink-0 items-center gap-1 text-[12px] font-semibold"
                style={{ color: t }}
                dir="ltr"
                data-mono="true"
              >
                <TrendingDown className="size-3" />
                {fmtDays(v.daysToZero)}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        קצב = יומי × 7. הזמן עד אפס מבוסס על הקצב הנוכחי בלבד — לא כולל
        הכנסה צפויה.
      </p>
    </section>
  );
}
