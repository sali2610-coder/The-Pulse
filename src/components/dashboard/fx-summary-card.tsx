"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { summarizeForeignCurrency } from "@/lib/fx-summary";
import { currentMonthKey } from "@/lib/dates";

const CURRENCY_TONE = {
  USD: "#34D399",
  EUR: "#A78BFA",
  GBP: "#F87171",
  OTHER: "#D4AF37",
} as const;

const CURRENCY_LABEL = {
  USD: "דולר",
  EUR: "יורו",
  GBP: "פאונד",
  OTHER: "מטבע אחר",
} as const;

function formatAmount(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

/**
 * Compact FX outflow card. Renders only when there's at least one
 * non-ILS charge this month. Each bucket shows currency label,
 * native-currency total, and a chip with the entry count. Excluded
 * from every budget calculation by design — this card is informational.
 */
export function FxSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const fx = useMemo(() => {
    if (!hydrated) return null;
    return summarizeForeignCurrency({
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries]);

  if (!hydrated || !fx) return null;
  if (fx.buckets.length === 0) return null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
            <Globe className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              מטבע חוץ
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              לא נספר בתקציב — הצגה בלבד
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[10px] text-muted-foreground"
        >
          {fx.totalEntries} חיובים
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {fx.buckets.map((b) => {
          const tone =
            CURRENCY_TONE[b.currency as keyof typeof CURRENCY_TONE] ??
            CURRENCY_TONE.OTHER;
          const label =
            CURRENCY_LABEL[b.currency as keyof typeof CURRENCY_LABEL] ??
            b.currency;
          return (
            <li
              key={b.currency}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/30 p-2.5"
            >
              <div className="flex items-center gap-2 text-[12px] text-foreground">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: `${tone}22`, color: tone }}
                  dir="ltr"
                >
                  {b.currency}
                </span>
                <span>{label}</span>
                <span className="text-[10px] text-muted-foreground">
                  · {b.count} חיובים
                </span>
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="text-[13px] font-semibold"
                style={{ color: tone }}
              >
                {formatAmount(b.currency, b.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
