"use client";

// Phase 317 — "עומס הלוואות" reworked.
//
// Surfaces every loan that matters this month: actively firing, OR
// starting within the next month, OR ending within 3 months. Each
// row shows monthly amount, next charge date, source, remaining
// payments and a status chip (יורד בקרוב / פעיל / מסתיים בקרוב).
// Tap a row → BottomSheet with full detail + edit shortcut to the
// Settings tab.
//
// Aggregate summary tiles (active count, monthly burden, total
// remaining, debt-free month) stay on top so the user reads the
// bottom line before scanning the list.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  BadgeCheck,
  CalendarCheck2,
  ChevronLeft,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { summarizeLoans } from "@/lib/loan-summary";
import {
  buildObligationsOverview,
  LOAN_STATUS_LABEL,
  type LoanRow,
  type LoanStatus,
} from "@/lib/obligations-overview";
import { currentMonthKey, monthIndex } from "@/lib/dates";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { LoanFullScreenEdit } from "@/components/loans/loan-fullscreen-edit";
import { tap as hapticTap } from "@/lib/haptics";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

const HEBREW_MONTH = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function formatMonthKey(monthKey?: string): string {
  if (!monthKey) return "—";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return `${HEBREW_MONTH[m - 1]} ${y}`;
}

const STATUS_TONE: Record<LoanStatus, { bg: string; fg: string }> = {
  "starting-soon": { bg: "#60A5FA22", fg: "#60A5FA" },
  active: { bg: "#34D39922", fg: "#34D399" },
  "ending-soon": { bg: "#D4AF3722", fg: "#D4AF37" },
};

export function LoanSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
  const [openLoanId, setOpenLoanId] = useState<string | null>(null);
  // Phase 409 — full-screen edit modal (shared shell with the
  // expense-edit UX). `editLoanId === null` + `editOpen=true` means
  // "add new loan" mode.
  const [editLoanId, setEditLoanId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthKey = currentMonthKey();

  const summary = useMemo(() => {
    if (!hydrated) return null;
    return summarizeLoans({ loans, monthKey });
  }, [hydrated, loans, monthKey]);

  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey,
    });
  }, [hydrated, loans, rules, accounts, monthKey]);

  if (!hydrated || !summary || !overview) return null;
  // Show the card whenever any loan is active OR coming up soon.
  if (overview.loans.length === 0) return null;

  const monthsToDebtFree =
    summary.debtFreeMonthKey !== undefined
      ? monthIndex(summary.debtFreeMonthKey) - monthIndex(monthKey)
      : undefined;

  const activeRow = overview.loans.find((r) => r.loan.id === openLoanId) ?? null;

  return (
    <>
      <motion.section
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card flex flex-col gap-3 rounded-3xl p-4"
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
              <Banknote className="size-4" strokeWidth={1.8} />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                עומס הלוואות
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                {overview.loans.length === 1
                  ? "הלוואה אחת"
                  : `${overview.loans.length} הלוואות`}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 leading-tight">
            <span
              data-mono="true"
              dir="ltr"
              className="text-[15px] font-semibold text-destructive"
            >
              −{ILS.format(summary.totalMonthly)} / חודש
            </span>
            {summary.completedSoonCount > 0 ? (
              <span
                className="flex items-center gap-1 rounded-full bg-[#34D399]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#34D399]"
                dir="rtl"
              >
                <BadgeCheck className="size-3" />
                נסגרים בקרוב · {summary.completedSoonCount}
              </span>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="נותר לתשלום"
            value={ILS.format(summary.totalRemaining)}
            tone="#F87171"
          />
          <Tile
            label="חופשי מחוב"
            value={
              summary.debtFreeMonthKey
                ? formatMonthKey(summary.debtFreeMonthKey)
                : "—"
            }
            tone="#34D399"
            ltr={false}
          />
        </div>

        {monthsToDebtFree !== undefined && monthsToDebtFree > 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CalendarCheck2 className="size-3 text-[#34D399]" />
            <span>
              עוד {monthsToDebtFree} חודשים עד שתפסיק לשלם הלוואות
            </span>
          </div>
        ) : null}

        <ul className="flex flex-col gap-1.5">
          {overview.loans.map((row, idx) => (
            <motion.li
              key={row.loan.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(idx, 6) * STAGGER_TIGHT,
                duration: 0.25,
                ease: EASE_OUT_EXPO,
              }}
            >
              <LoanListRow
                row={row}
                onOpen={() => {
                  hapticTap();
                  // Phase 409 — tapping a loan row now opens the
                  // full-screen edit instead of the detail sheet.
                  // The legacy LoanDetailSheet stays mounted for
                  // the older entry-point but no longer fires here.
                  setEditLoanId(row.loan.id);
                  setEditOpen(true);
                }}
              />
            </motion.li>
          ))}
        </ul>

        {/* Phase 409 — "הוסף הלוואה" CTA. Opens the same full-screen
           in add mode (loanId=null). */}
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setEditLoanId(null);
            setEditOpen(true);
          }}
          className="mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.02] text-[12.5px] text-foreground/85 transition-colors hover:border-white/16"
        >
          + הוסף הלוואה
        </button>
      </motion.section>

      <LoanDetailSheet
        row={activeRow}
        open={activeRow !== null}
        onOpenChange={(o) => {
          if (!o) setOpenLoanId(null);
        }}
      />
      <LoanFullScreenEdit
        loanId={editLoanId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditLoanId(null);
        }}
      />
    </>
  );
}

function LoanListRow({
  row,
  onOpen,
}: {
  row: LoanRow;
  onOpen: () => void;
}) {
  const tone = STATUS_TONE[row.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`פירוט ${row.loan.label}: ${ILS.format(row.monthlyAmount)} בחודש`}
      className="flex w-full items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 text-start transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
    >
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <Wallet className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {row.loan.label}
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="shrink-0 text-[13px] font-semibold text-foreground"
          >
            {ILS.format(row.monthlyAmount || row.loan.monthlyInstallment)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground/85">
          <span>
            יורד ב־{DAY_FMT.format(row.nextChargeDate)} · {row.sourceLabel}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {LOAN_STATUS_LABEL[row.status]}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/75">
          <span>
            {row.paymentLabel
              ? `תשלום ${row.paymentLabel}`
              : row.remainingPayments !== undefined
                ? `נותרו ${row.remainingPayments} תשלומים`
                : "הלוואה פתוחה"}
          </span>
          {row.endMonthKey ? <span>סיום · {formatMonthKey(row.endMonthKey)}</span> : null}
        </div>
      </div>
      <ChevronLeft className="mt-2 size-3.5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

function LoanDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: LoanRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!row) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title="פירוט הלוואה">
        <div />
      </BottomSheet>
    );
  }
  const tone = STATUS_TONE[row.status];
  const projected = row.monthlyAmount * Math.min(row.remainingPayments ?? 3, 3);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`פירוט ${row.loan.label}`}
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <Wallet className="size-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">
              {row.loan.label}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              הלוואה
            </span>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {LOAN_STATUS_LABEL[row.status]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <DetailTile
          label="החזר חודשי"
          value={ILS.format(row.loan.monthlyInstallment)}
          tone="#F87171"
        />
        <DetailTile
          label="חיוב הבא"
          value={DAY_FMT.format(row.nextChargeDate)}
          tone="#60A5FA"
        />
        <DetailTile
          label="נותרו"
          value={
            row.remainingPayments !== undefined
              ? `${row.remainingPayments} תשלומים`
              : "פתוחה"
          }
          tone="#A78BFA"
          ltr={false}
        />
        <DetailTile
          label="סיום צפוי"
          value={row.endMonthKey ? formatMonthKey(row.endMonthKey) : "—"}
          tone="#34D399"
          ltr={false}
        />
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/25 p-3 text-[11.5px] text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span>מקור החיוב</span>
          <span className="text-foreground">{row.sourceLabel}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span>צפי לרדת ב-3 חודשים הקרובים</span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-foreground"
          >
            −{ILS.format(projected)}
          </span>
        </div>
        {row.paymentLabel ? (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span>תשלום</span>
            <span data-mono="true" dir="ltr" className="text-foreground">
              {row.paymentLabel}
            </span>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        לשינוי סכום / תאריך / השהיה — היכנס ללשונית הגדרות → הלוואות.
      </p>
    </BottomSheet>
  );
}

function Tile({
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
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/6 bg-background/30 p-2.5">
      <span className="text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir={ltr ? "ltr" : "rtl"}
        className="text-[13px] font-semibold"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}

function DetailTile({
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
