"use client";

// Phase 211 — per-bucket drilldown sheet.
//
// Tap a CashflowBuckets row → opens this sheet with every
// contributing obligation listed chronologically (label + amount +
// effective cash date + kind chip). Read-only.

import { motion } from "framer-motion";
import {
  CalendarClock,
  CreditCard,
  Landmark,
  Receipt,
  Repeat2,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SectionHeader } from "@/components/ui/section-header";
import { Pill } from "@/components/ui/pill";
import type { CashFlowBucket } from "@/lib/cash-flow-bucket";
import { listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const KIND_LABEL: Record<string, string> = {
  recurring: "הוצאה קבועה",
  installment: "פלאן תשלומים",
  loan: "הלוואה",
  card_entry: "חיוב כרטיס",
};

type Props = {
  bucket: CashFlowBucket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CashflowBucketDrilldownSheet({ bucket, open, onOpenChange }: Props) {
  const icon =
    bucket?.source === "card" ? (
      <CreditCard />
    ) : bucket?.source === "loan" ? (
      <CalendarClock />
    ) : (
      <Landmark />
    );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bucket?.label ?? "פרטי מקור"}
    >
      {!bucket ? (
        <p className="text-center text-[12px] text-muted-foreground">
          לא נמצא מקור.
        </p>
      ) : (
        <>
          <SectionHeader
            icon={icon}
            title={bucket.label}
            trailing={
              bucket.cardLast4 ? (
                <Pill>····{bucket.cardLast4}</Pill>
              ) : null
            }
          />

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-3 text-[11px]">
            <Stat
              label="סך החודש"
              value={`−${ILS.format(bucket.monthlyTotal)}`}
              tone="neg"
            />
            <Stat
              label="התחייבויות"
              value={String(bucket.obligationCount)}
            />
            <Stat
              label="חיוב הבא"
              value={
                bucket.nextSettlementAt
                  ? DAY_FMT.format(new Date(bucket.nextSettlementAt))
                  : "—"
              }
            />
            <Stat
              label="מקור"
              value={
                bucket.source === "card"
                  ? "כרטיס אשראי"
                  : bucket.source === "loan"
                    ? "הלוואה"
                    : "חשבון בנק"
              }
            />
          </div>

          {bucket.obligations.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {bucket.obligations.map((ob, idx) => (
                <motion.li
                  key={`${ob.refId}:${ob.effectiveCashAt}:${idx}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={listReveal(idx)}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-2.5"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8 text-muted-foreground">
                    {ob.kind === "installment" ? (
                      <Repeat2 className="size-3.5" />
                    ) : ob.kind === "card_entry" ? (
                      <CreditCard className="size-3.5" />
                    ) : ob.kind === "loan" ? (
                      <CalendarClock className="size-3.5" />
                    ) : (
                      <Receipt className="size-3.5" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {ob.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/85">
                      {KIND_LABEL[ob.kind] ?? ob.kind} ·{" "}
                      {DAY_FMT.format(new Date(ob.effectiveCashAt))}
                    </span>
                  </div>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="shrink-0 text-[12.5px] font-medium text-destructive"
                  >
                    −{ILS.format(ob.amount)}
                  </span>
                </motion.li>
              ))}
            </ul>
          ) : null}

          <p className="text-[10px] text-muted-foreground/80">
            סך כל ההתחייבויות לפי תאריך הסליקה האמיתי. הוצאות שכבר ירדו
            לא מוצגות כאן.
          </p>
        </>
      )}
    </BottomSheet>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neg" | "neutral";
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12.5px] font-medium"
        style={{ color: tone === "neg" ? "#F87171" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
