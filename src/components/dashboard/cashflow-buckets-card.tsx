"use client";

// Phase 208 — per-source obligation buckets.
//
// Replaces the conceptually-wrong "fixed expenses total" with one
// card per real settlement source: each active credit card, each
// loan, and one "bank direct debit" bucket. Lets the user instantly
// see "which card will hit, when, and how much".

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CreditCard,
  Landmark,
  Layers,
  Receipt,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildCashFlowBuckets,
  type CashFlowBucket,
} from "@/lib/cash-flow-bucket";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { CashflowBucketDrilldownSheet } from "@/components/dashboard/cashflow-bucket-drilldown-sheet";
import {
  bucketsToCsv,
  downloadCsv,
} from "@/lib/csv-export-forecast";
import { CARD_TAP, listReveal } from "@/lib/motion-tokens";
import { tap } from "@/lib/haptics";
import { Download } from "lucide-react";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

const SOURCE_ICON: Record<CashFlowBucket["source"], React.ReactNode> = {
  card: <CreditCard className="size-3.5" />,
  loan: <CalendarClock className="size-3.5" />,
  bank_debit: <Landmark className="size-3.5" />,
};

const SOURCE_TONE: Record<CashFlowBucket["source"], string> = {
  card: "#A78BFA",
  loan: "#F87171",
  bank_debit: "#60A5FA",
};

export function CashflowBucketsCard() {
  const [active, setActive] = useState<CashFlowBucket | null>(null);
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
  }, [hydrated, accounts, loans, rules, statuses, entries]);

  if (!hydrated || !report) return null;

  if (report.buckets.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Layers />} title="התחייבויות לפי מקור" />
        <CardEmpty
          icon={<Receipt className="size-4" />}
          title="אין התחייבויות עתידיות"
          reason="עוד אין הוצאות קבועות, הלוואות, או חיובי כרטיס שזוהו ל-35 הימים הקרובים."
          unlockHint="הגדר הוצאות קבועות / הלוואות / כרטיסים כדי שהגלריה הזו תתמלא."
        />
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Layers />}
        title="התחייבויות לפי מקור"
        trailing={
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70" dir="ltr">
              סה״כ {ILS.format(report.totalCommitted)}
            </span>
            <button
              type="button"
              onClick={() => {
                tap();
                downloadCsv({
                  csv: bucketsToCsv(report),
                  filename: `sally-buckets-${new Date().toISOString().slice(0, 10)}.csv`,
                });
              }}
              aria-label="ייצוא CSV של התחייבויות"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
            >
              <Download className="size-3" />
              CSV
            </button>
          </div>
        }
      />

      <ul className="flex flex-col gap-1.5">
        {report.buckets.map((b, idx) => (
          <BucketRow
            key={b.id}
            bucket={b}
            index={idx}
            onActivate={() => {
              tap();
              setActive(b);
            }}
          />
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        חיובי כרטיס מקובצים לפי הכרטיס המבצע — לא לפי יום החיוב של ההוצאה
        עצמה. הוצאה קבועה המשולמת בכרטיס תופיע כאן תחת הכרטיס.
      </p>

      <CashflowBucketDrilldownSheet
        bucket={active}
        open={active !== null}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      />
    </section>
  );
}

function BucketRow({
  bucket,
  index,
  onActivate,
}: {
  bucket: CashFlowBucket;
  index: number;
  onActivate: () => void;
}) {
  const tone = SOURCE_TONE[bucket.source];
  return (
    <motion.li
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      whileTap={CARD_TAP}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`פתח פירוט — ${bucket.label}`}
      className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 cursor-pointer outline-none transition-colors hover:border-white/16 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${tone}22`, color: tone }}
      >
        {SOURCE_ICON[bucket.source]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {bucket.label}
          </span>
          {bucket.cardLast4 ? (
            <span
              className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] text-muted-foreground"
              dir="ltr"
            >
              ····{bucket.cardLast4}
            </span>
          ) : null}
        </div>
        <span className="text-[10.5px] text-muted-foreground/85">
          {bucket.obligationCount} התחייבויות
          {bucket.nextSettlementAt ? (
            <>
              {" · "}
              חיוב הבא ב-{DAY_FMT.format(new Date(bucket.nextSettlementAt))}
            </>
          ) : null}
        </span>
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="shrink-0 text-[14px] font-semibold"
        style={{ color: "#F87171" }}
      >
        −{ILS.format(bucket.monthlyTotal)}
      </span>
    </motion.li>
  );
}
