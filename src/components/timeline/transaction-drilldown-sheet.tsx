"use client";

// Bottom-sheet drilldown for a single transaction. Different from
// the ExpenseEditSheet (which is form-first for editing). This sheet
// is insight-first — surfaces the merchant context, frequency,
// average, last visit, recurring detection, unusual flags, and
// installment progress. No mutations.
//
// Mounted via lazy import from RecentActivity / DailyFlowCard so
// the drilldown chunk only loads once a user actually opens a row.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Repeat2,
  Store,
  Tag,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { merchantDetail } from "@/lib/merchant-detail";
import { getCategory } from "@/lib/categories";
import { SectionHeader } from "@/components/ui/section-header";
import { StatRow } from "@/components/ui/stat-row";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { Pill } from "@/components/ui/pill";
import { listReveal } from "@/lib/motion-tokens";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "זוהה במנוי",
  medium: "זוהה לפי שם",
  low: "ללא זיהוי",
};

const CONFIDENCE_SEV: Record<string, InsightSeverity> = {
  high: "info",
  medium: "watch",
  low: "warn",
};

type Props = {
  entry: ExpenseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TransactionDrilldownSheet({ entry, open, onOpenChange }: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);

  const detail = useMemo(() => {
    if (!entry) return null;
    return merchantDetail({ entry, entries, rules });
  }, [entry, entries, rules]);

  const sliceAmount = entry
    ? entry.amount / Math.max(1, entry.installments)
    : 0;
  const cat = entry ? getCategory(entry.category) : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.label ?? "פרטי עסקה"}
    >
      {!entry || !detail || !cat ? (
        <p className="text-center text-[12px] text-muted-foreground">
          לא נמצאה עסקה.
        </p>
      ) : (
        <>
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[18px] font-medium text-foreground">
                {detail.label}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Pill tone="neon" icon={<Tag className="size-2.5" />}>
                  {cat.label}
                </Pill>
                {entry.cardLast4 ? (
                  <Pill icon={<CreditCard className="size-2.5" />}>····{entry.cardLast4}</Pill>
                ) : null}
                {detail.installmentContext ? (
                  <Pill
                    tone="purple"
                    icon={<Repeat2 className="size-2.5" />}
                  >
                    {detail.installmentContext.index}/
                    {detail.installmentContext.total}
                  </Pill>
                ) : null}
              </div>
              <span className="text-[11px] text-muted-foreground/85">
                {DATE_FMT.format(new Date(entry.chargeDate))}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end leading-tight">
              <span
                data-mono="true"
                dir="ltr"
                className="text-[22px] font-medium"
                style={{ color: entry.isRefund ? "#34D399" : undefined }}
              >
                {entry.isRefund ? "+" : "−"}
                {ILS.format(sliceAmount)}
              </span>
              {entry.installments > 1 ? (
                <span className="text-[10px] text-muted-foreground/80">
                  סה״כ {ILS.format(entry.amount)}
                </span>
              ) : null}
            </div>
          </header>

          {(detail.isUnusual ||
            detail.installmentContext ||
            detail.matchedRule) && (
            <div className="flex flex-wrap gap-1.5">
              {detail.isUnusual ? (
                <InsightChip
                  severity="warn"
                  icon={<AlertTriangle className="size-2.5" />}
                  label="חיוב גבוה מהרגיל"
                />
              ) : null}
              {detail.matchedRule ? (
                <InsightChip
                  severity="info"
                  icon={<Repeat2 className="size-2.5" />}
                  label="מקושר למנוי"
                />
              ) : null}
              {detail.installmentContext ? (
                <InsightChip
                  severity="info"
                  icon={<CalendarClock className="size-2.5" />}
                  label={`${ILS.format(detail.installmentContext.perMonth)} לתשלום`}
                />
              ) : null}
              <InsightChip
                severity={CONFIDENCE_SEV[detail.confidence]}
                icon={<Store className="size-2.5" />}
                label={CONFIDENCE_LABEL[detail.confidence]}
              />
            </div>
          )}

          {detail.key ? (
            <section className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-3">
              <SectionHeader icon={<Store />} title="הקשר של בית העסק" />
              <StatRow
                label="ביקורים ב־90 ימים"
                value={String(detail.visits90)}
              />
              <StatRow
                label="ממוצע חיוב"
                value={ILS.format(detail.averageTicket)}
                tone="neutral"
              />
              {detail.lastVisit ? (
                <StatRow
                  label="ביקור אחרון"
                  value={DATE_FMT.format(new Date(detail.lastVisit))}
                  sub={
                    detail.daysSinceLast !== null
                      ? `לפני ${detail.daysSinceLast} ימים`
                      : undefined
                  }
                />
              ) : null}
            </section>
          ) : null}

          {detail.matchedRule ? (
            <section className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-3">
              <SectionHeader icon={<Repeat2 />} title="מנוי מקושר" />
              <StatRow label="שם" value={detail.matchedRule.label} />
              <StatRow
                label="חיוב צפוי"
                value={ILS.format(detail.matchedRule.estimatedAmount)}
                sub={`יום ${detail.matchedRule.dayOfMonth} בכל חודש`}
              />
              {detail.linkedSubs.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    מנויים דומים
                  </span>
                  <ul className="flex flex-wrap gap-1">
                    {detail.linkedSubs.map((r, idx) => (
                      <motion.li
                        key={r.id}
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={listReveal(idx)}
                      >
                        <Pill>{r.label}</Pill>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {entry.note ? (
            <section className="rounded-2xl border border-white/8 bg-black/20 p-3 text-[12px] leading-relaxed text-foreground/90">
              {entry.note}
            </section>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}
