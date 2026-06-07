"use client";

// Phase 317 — "סל דיור חודשי" enriched.
//
// Every subcategory row now exposes:
//   • subtotal (sum across the rules in that subcategory)
//   • next charge date (earliest upcoming rule in the row)
//   • source label (bank / card name / mixed)
//   • count of charges + "חיוב קבוע" / "תשלום" hint
//
// Tap a row → BottomSheet with the rules inside the subcategory,
// each one showing its own amount / day / source so the user can
// audit what's actually inside the bucket.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Home, Sparkles, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildObligationsOverview,
  SOURCE_LABEL_MAP,
  type HousingRow,
} from "@/lib/obligations-overview";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap } from "@/lib/haptics";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import type { RecurringRule } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

function chargeKindLabel(rule: RecurringRule): string {
  if (rule.installmentTotal && rule.installmentTotal > 0) return "תשלום";
  if (rule.variable) return "חיוב משתנה";
  return "חיוב קבוע";
}

function rowChargeKindLabel(row: HousingRow): string {
  // If any rule in the row is an installment plan, surface that
  // since it has a fixed end. Otherwise it's a regular bill.
  const hasInstallment = row.rules.some(
    (r) => r.installmentTotal && r.installmentTotal > 0,
  );
  if (hasInstallment) return "תשלום";
  return "חיוב קבוע";
}

export function HousingCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const accounts = useFinanceStore((s) => s.accounts);
  const [openSub, setOpenSub] = useState<string | null>(null);

  const monthKey = currentMonthKey();

  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey,
    });
  }, [hydrated, loans, rules, accounts, monthKey]);

  const shareOfIncome = useMemo(() => {
    if (!hydrated || !overview) return null;
    const totalIncome = incomes
      .filter((i) => i.active)
      .reduce((sum, i) => sum + i.amount, 0);
    if (totalIncome === 0) return null;
    return overview.recurringMonthly / totalIncome;
  }, [hydrated, overview, incomes]);

  if (!hydrated || !overview || overview.housing.length === 0) return null;

  const sharePct =
    shareOfIncome !== null ? Math.round(shareOfIncome * 100) : null;
  const shareTone =
    sharePct === null
      ? "muted"
      : sharePct >= 45
        ? "warn"
        : sharePct >= 30
          ? "watch"
          : "calm";
  const shareClass =
    shareTone === "warn"
      ? "text-destructive"
      : shareTone === "watch"
        ? "text-gold"
        : shareTone === "calm"
          ? "text-[#34D399]"
          : "text-muted-foreground";

  const activeRow =
    overview.housing.find((r) => r.sub === openSub) ?? null;

  return (
    <>
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
        <header className="flex items-baseline justify-between">
          <div className="flex flex-col text-right leading-tight">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <Home className="size-3 text-gold" />
              סל דיור חודשי
            </div>
            <span className="text-[10px] text-muted-foreground/70">
              הוצאות קבועות סביב הבית
            </span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span
              data-mono="true"
              dir="ltr"
              className="text-xl font-light text-foreground"
            >
              {ILS.format(overview.recurringMonthly)}
            </span>
            {sharePct !== null ? (
              <span className={`text-[10px] font-medium ${shareClass}`}>
                {sharePct}% מההכנסה
              </span>
            ) : null}
          </div>
        </header>

        <ul className="flex flex-col gap-1.5">
          {overview.housing.map((row, idx) => (
            <motion.li
              key={row.sub}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.3,
                ease: EASE_OUT_EXPO,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  setOpenSub(row.sub);
                }}
                aria-label={`פירוט ${row.label}: ${ILS.format(row.monthlyTotal)} חודשי`}
                className="flex w-full items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 text-start transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium text-foreground">
                      {row.label}
                    </span>
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="shrink-0 text-[13px] font-semibold text-foreground"
                    >
                      {ILS.format(row.monthlyTotal)}
                    </span>
                  </div>
                  <span className="truncate text-[10.5px] text-muted-foreground/85">
                    יורד ב־{DAY_FMT.format(row.nextChargeDate)} ·{" "}
                    {row.sourceLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {rowChargeKindLabel(row)} ·{" "}
                    {row.ruleCount === 1
                      ? "חיוב אחד"
                      : `${row.ruleCount} חיובים`}
                  </span>
                </div>
                <ChevronLeft className="mt-2 size-3.5 shrink-0 text-muted-foreground/60" />
              </button>
            </motion.li>
          ))}
        </ul>

        {sharePct !== null && sharePct >= 35 ? (
          <p className="flex items-start gap-1.5 rounded-xl border border-gold/30 bg-gold/8 p-2 text-[11px] leading-relaxed text-foreground/90">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" />
            סל הדיור צורך כ-{sharePct}% מההכנסה החודשית — מעל הסף הבריא של 30%.
          </p>
        ) : null}

        {/* Phase 408 — scope explainer. User confusion: "סל דיור" is
           a SUBSET of the "קבועים" KPI above (rules tagged as
           housing-related); the rest of the fixed bills sit
           elsewhere. Inline disclosure spells out the criterion so
           the user can reconcile the total against MonthlyObligations
           "קבועים". No engine change. */}
        <details className="rounded-2xl border border-white/8 bg-white/[0.02] p-2 text-[11.5px] text-foreground/85">
          <summary className="cursor-pointer list-none px-1 text-[11px] text-muted-foreground">
            מה נכנס לסל הדיור?
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 px-1 pb-1" dir="rtl">
            <p>
              <strong className="text-foreground">סל דיור</strong> =
              תת-קבוצה של החיובים הקבועים: שכר דירה (לא משכנתא —
              משכנתא יושבת ב״הלוואות״), ביטוח דירה, ארנונה, חשמל,
              מים, גז, ועד בית, אינטרנט, סטרימינג, ודיור נוסף.
            </p>
            <p>
              הסיווג הוא{" "}
              <strong className="text-foreground">אוטומטי</strong>{" "}
              לפי label ו-keywords של החיוב הקבוע. חיובים שאינם נכנסים
              לסל (חינוך, מנויים אחרים, תחבורה, מתנות וכו׳) ייספרו
              תחת ״חיובים קבועים״ הרגיל למעלה. הלוואות אינן נספרות פה
              כלל — הן בלשונית ״הלוואות״ בלבד.
            </p>
            <p className="text-[10.5px] text-muted-foreground/80">
              לכן: ״קבועים״ {ILS.format(overview.fixedMonthly)} ≥
              ״סל דיור״ {ILS.format(overview.recurringMonthly)}.
              ההפרש = חיובים קבועים שאינם דיור.
            </p>
          </div>
        </details>
      </section>

      <HousingRowSheet
        row={activeRow}
        accounts={accounts}
        open={activeRow !== null}
        onOpenChange={(o) => {
          if (!o) setOpenSub(null);
        }}
      />
    </>
  );
}

function HousingRowSheet({
  row,
  accounts,
  open,
  onOpenChange,
}: {
  row: HousingRow | null;
  accounts: ReturnType<typeof useFinanceStore.getState>["accounts"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!row) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="פירוט סל">
        <div />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`פירוט ${row.label}`}
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Home className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">{row.label}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {rowChargeKindLabel(row)}
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[15px] font-semibold text-foreground"
        >
          {ILS.format(row.monthlyTotal)}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <SheetTile
          label="חיוב הבא"
          value={DAY_FMT.format(row.nextChargeDate)}
          tone="#60A5FA"
        />
        <SheetTile
          label="מקור"
          value={row.sourceLabel}
          tone="#A78BFA"
          ltr={false}
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        {row.rules.map((rule) => {
          const source = (rule.paymentSource ?? "unknown") as
            | "bank"
            | "card"
            | "cash"
            | "unknown";
          const card =
            source === "card"
              ? accounts.find((a) => a.id === rule.linkedCardId)
              : null;
          const sourceLabel =
            card !== null && card !== undefined
              ? card.cardLast4
                ? `${card.label} ****${card.cardLast4}`
                : card.label
              : SOURCE_LABEL_MAP[source];

          return (
            <li
              key={rule.id}
              className="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                <Wallet className="size-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium text-foreground">
                    {rule.label}
                  </span>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="shrink-0 text-[12.5px] font-semibold text-foreground"
                  >
                    {ILS.format(rule.estimatedAmount)}
                  </span>
                </div>
                <span className="text-[10.5px] text-muted-foreground/85">
                  כל חודש ביום {rule.dayOfMonth} · {sourceLabel}
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {chargeKindLabel(rule)}
                  {rule.installmentTotal && rule.installmentTotal > 0
                    ? ` · ${rule.installmentTotal} תשלומים`
                    : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-muted-foreground/80">
        לעריכת חיוב — היכנס ללשונית הגדרות → חיובים קבועים.
      </p>
    </BottomSheet>
  );
}

function SheetTile({
  label,
  value,
  tone,
  ltr = true,
}: {
  label: string;
  value: string;
  tone: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir={ltr ? "ltr" : "rtl"}
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
