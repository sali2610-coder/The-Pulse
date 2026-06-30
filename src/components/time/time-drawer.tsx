"use client";

// Phase 358 / C — TimeDrawer.
//
// Pull-up drawer at the bottom of the TimeScreen. Reuses the existing
// FutureBalanceExplain (transparent breakdown) verbatim so there's
// only ONE breakdown component in the codebase. Above it: small
// signal cluster ("איך הגעתי לכאן") for the impatient.
//
// Phase 399 — also surfaces the canonical Time-curve completeness
// sentinel. Any credit charge that the cards screen + cockpit count
// but the 35-day curve does NOT settle is listed here so no future
// debit silently drops off the orbit.

import { motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { FutureBalanceExplain } from "@/components/dashboard/simple/future-balance-explain";
import {
  buildEngineCtx,
  getTimelineCompleteness,
  type TimelineMissingEntry,
} from "@/lib/financial-engine";
import { useFinanceStore } from "@/lib/store";
// Phase 428 — Time tab silent.

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function TimeDrawer({ offset }: { offset: number }) {
  const [open, setOpen] = useState(false);

  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const missing = useMemo<TimelineMissingEntry[]>(() => {
    if (!hydrated) return [];
    return getTimelineCompleteness(
      buildEngineCtx({
        accounts,
        rules,
        statuses,
        entries,
        loans,
        incomes,
        monthlyBudget,
      }),
    );
  }, [
    hydrated,
    accounts,
    rules,
    statuses,
    entries,
    loans,
    incomes,
    monthlyBudget,
  ]);

  return (
    <section className="mt-4 flex flex-col gap-3 px-1">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right text-[12.5px] text-foreground/85 transition-colors hover:border-white/16"
      >
        <ChevronUp
          className="size-4 text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
        <span className="flex flex-col gap-0.5 text-right">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            פירוט
          </span>
          <span>איך הגעתי לכאן — מקור כל שקל</span>
        </span>
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{ overflow: "hidden" }}
      >
        <div className="pt-1">
          <FutureBalanceExplain offset={offset} />
          {missing.length > 0 ? <TimelineMissingSection missing={missing} /> : null}
        </div>
      </motion.div>
    </section>
  );
}

function TimelineMissingSection({
  missing,
}: {
  missing: TimelineMissingEntry[];
}) {
  const total = missing.reduce((s, m) => s + m.amount, 0);
  return (
    <div
      className="mt-3 rounded-2xl border border-[#FBBF24]/40 bg-[#FBBF24]/[0.06] p-3"
      dir="rtl"
      role="status"
      aria-label="חיובים שלא הופיעו על הציר"
    >
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="text-[11px] uppercase tracking-[0.22em] text-[#FBBF24]">
          חיובים שחסרים מהציר · {missing.length}
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[12px] font-medium text-[#FBBF24]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ILS.format(Math.round(total))}
        </span>
      </div>
      <p className="pb-2 text-[11px] text-foreground/80">
        החיובים הבאים נספרים בכרטיסי האשראי ובסך ההתחייבויות אבל לא מופיעים
        על הציר ב-35 הימים הקרובים. בדרך כלל בגלל ארנק שלא אושר, חיוב SMS
        תלוי, או כרטיס שלא משויך לעסקה.
      </p>
      <ul className="flex flex-col gap-1">
        {missing.map((m) => (
          <li
            key={m.refId}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="line-clamp-1 text-[12px] text-foreground/90">
                {m.label}
              </span>
              <span className="text-[10.5px] text-muted-foreground/80">
                {m.reason}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[12px] font-medium"
              style={{
                color: "#FBBF24",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ILS.format(Math.round(m.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
