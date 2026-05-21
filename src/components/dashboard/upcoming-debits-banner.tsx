"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CreditCard } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { upcomingCardDebits } from "@/lib/upcoming-card-debits";
import { getIssuerMeta } from "@/lib/card-issuers";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

/**
 * Surfaces card bank-debits landing in the next 7 days. Built on
 * Phase 90 metadata (billingDay + paymentDay) + the Phase 100 cycle
 * window. Renders nothing when no debit is imminent.
 *
 * Tone tinted by urgency:
 *   • ≤ 2 days → red ("חיוב מיידי")
 *   • ≤ 5 days → gold
 *   • else      → neutral neon
 */
export function UpcomingDebitsBanner() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const entries = useFinanceStore((s) => s.entries);

  const debits = useMemo(() => {
    if (!hydrated) return [];
    return upcomingCardDebits({ accounts, entries, horizonDays: 7 });
  }, [hydrated, accounts, entries]);

  if (!hydrated) return null;
  if (debits.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {debits.slice(0, 3).map((d) => {
          const tone =
            d.daysUntil <= 2
              ? "#F87171"
              : d.daysUntil <= 5
                ? "#D4AF37"
                : "#00E5FF";
          const account = accounts.find((a) => a.id === d.accountId);
          const issuerMeta = getIssuerMeta(account?.issuer);
          const dayLabel =
            d.daysUntil === 0
              ? "היום"
              : d.daysUntil === 1
                ? "מחר"
                : `עוד ${d.daysUntil} ימים`;
          return (
            <motion.div
              key={d.accountId}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-2.5 rounded-2xl border p-3"
              style={{
                borderColor: `${tone}66`,
                background: `${tone}10`,
              }}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${tone}22`, color: tone }}
              >
                <CalendarClock className="size-4" strokeWidth={1.8} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: tone }}
                  >
                    חיוב בנק קרוב
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{ background: `${tone}22`, color: tone }}
                  >
                    {dayLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                  <CreditCard
                    className="size-3.5"
                    style={{ color: issuerMeta.accent }}
                    strokeWidth={1.8}
                  />
                  <span>{d.cardLabel}</span>
                  {account?.cardLast4 ? (
                    <span
                      className="text-[10px] text-muted-foreground"
                      data-mono="true"
                      dir="ltr"
                    >
                      ····{account.cardLast4}
                    </span>
                  ) : null}
                </div>
                <div
                  className="text-[10.5px] text-muted-foreground"
                  dir="ltr"
                >
                  {DAY_FMT.format(d.paymentDate)} · {d.entryCount} חיובים
                </div>
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="shrink-0 text-[15px] font-semibold"
                style={{ color: tone }}
              >
                −{ILS.format(d.projectedAmount)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
