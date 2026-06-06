"use client";

// Phase 410 — Loans folder as a mini-app.
//
// Pilot consumer of the MiniAppShell primitives. Replaces the
// admin-style LoansPanel with a premium "Loan Manager" view:
//   • Hero KPI strip: monthly outflow + total remaining +
//     debt-free month.
//   • "+ הוסף הלוואה" CTA opens the Phase 409 LoanFullScreenEdit.
//   • Per-loan card with icon tone, primary "/חודש" amount,
//     "נותר ₪X" secondary, progress bar (paymentNumber / totalPayments),
//     status pill (פעיל / מסתיים בקרוב / מתחיל בקרוב).
//
// Tap a card → opens LoanFullScreenEdit in edit mode.
// Engine math untouched — same summarizeLoans + buildObligationsOverview
// outputs the LoanSummaryCard already consumes on the dashboard.

import { useMemo, useState } from "react";
import { Banknote, BadgeCheck, CalendarCheck2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey, monthIndex } from "@/lib/dates";
import { summarizeLoans } from "@/lib/loan-summary";
import {
  buildObligationsOverview,
  LOAN_STATUS_LABEL,
  type LoanRow,
  type LoanStatus,
} from "@/lib/obligations-overview";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppHero,
  MiniAppListCard,
  MiniAppSectionLabel,
  type MiniAppKpi,
} from "@/components/ui/mini-app-shell";
import { LoanFullScreenEdit } from "@/components/loans/loan-fullscreen-edit";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const HEB_MONTH = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

const STATUS_TONE: Record<LoanStatus, string> = {
  active: "#A78BFA",
  "ending-soon": "#34D399",
  "starting-soon": "#F6D970",
};

function formatMonthKey(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  if (!y || !m) return mk;
  return HEB_MONTH.format(new Date(y, m - 1, 1));
}

export function LoansMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
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

  const rows = overview.loans;
  const active = rows.filter((r) => r.status !== "starting-soon");
  const upcoming = rows.filter((r) => r.status === "starting-soon");

  const monthsToDebtFree =
    summary.debtFreeMonthKey !== undefined
      ? monthIndex(summary.debtFreeMonthKey) - monthIndex(monthKey)
      : undefined;

  const kpis: MiniAppKpi[] = [
    {
      label: "תשלום חודשי",
      value: ILS.format(summary.totalMonthly),
      tone: "#A78BFA",
      emphasis: true,
      caption:
        summary.activeCount === 0
          ? "אין הלוואות פעילות"
          : summary.activeCount === 1
            ? "הלוואה אחת פעילה"
            : `${summary.activeCount} הלוואות פעילות`,
    },
    {
      label: "נותר לתשלום",
      value: ILS.format(summary.totalRemaining),
      tone: "#F87171",
    },
    {
      label: "חופשי מחוב",
      value: summary.debtFreeMonthKey
        ? formatMonthKey(summary.debtFreeMonthKey)
        : "—",
      tone: "#34D399",
      caption:
        monthsToDebtFree !== undefined && monthsToDebtFree > 0
          ? `עוד ${monthsToDebtFree} חודשים`
          : undefined,
    },
  ];

  function openAdd() {
    setEditLoanId(null);
    setEditOpen(true);
  }

  function openEdit(id: string) {
    setEditLoanId(id);
    setEditOpen(true);
  }

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppHero
        title="מנהל ההלוואות"
        subtitle="עקוב אחרי כל הלוואה, נותר לתשלום והחודש שתיגמר"
        kpis={kpis}
      />

      {rows.length === 0 ? (
        <MiniAppEmpty
          icon={Banknote}
          title="עוד אין הלוואות"
          body="הוסף הלוואה ראשונה כדי לקבל מסלול תשלום, תאריך סיום וצפי לחופש מחוב."
          cta={{ label: "הוסף הלוואה", onClick: openAdd }}
        />
      ) : (
        <>
          <MiniAppAddCta label="הוסף הלוואה" onClick={openAdd} />

          {active.length > 0 ? (
            <>
              <MiniAppSectionLabel>פעילות עכשיו</MiniAppSectionLabel>
              <ul className="flex flex-col gap-2">
                {active.map((row) => (
                  <li key={row.loan.id}>
                    <LoanCard row={row} onClick={() => openEdit(row.loan.id)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {upcoming.length > 0 ? (
            <>
              <MiniAppSectionLabel>מתחילות בקרוב</MiniAppSectionLabel>
              <ul className="flex flex-col gap-2">
                {upcoming.map((row) => (
                  <li key={row.loan.id}>
                    <LoanCard row={row} onClick={() => openEdit(row.loan.id)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <LoanFullScreenEdit
        loanId={editLoanId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditLoanId(null);
        }}
      />
    </div>
  );
}

function LoanCard({
  row,
  onClick,
}: {
  row: LoanRow;
  onClick: () => void;
}) {
  const Icon = row.status === "ending-soon" ? BadgeCheck : Banknote;
  const tone = STATUS_TONE[row.status];
  const total = row.loan.totalPayments;
  const remaining = row.remainingPayments;
  const paid =
    total !== undefined && remaining !== undefined
      ? Math.max(0, total - remaining)
      : undefined;
  const progress =
    paid !== undefined && total !== undefined && total > 0
      ? paid / total
      : undefined;
  const progressLabel =
    paid !== undefined && total !== undefined
      ? `${paid}/${total} תשלומים שולמו`
      : undefined;
  const nextChargeLabel = (() => {
    const d = row.nextChargeDate;
    const day = d.getDate();
    const m = HEB_MONTH.format(d);
    return `כל ${day} ל${m.split(" ")[0]} · התשלום הבא ${day}/${
      d.getMonth() + 1
    }`;
  })();
  const subtitle =
    row.loan.dayOfMonth
      ? `יום ${row.loan.dayOfMonth} בכל חודש${
          row.endMonthKey ? ` · מסתיים ${formatMonthKey(row.endMonthKey)}` : ""
        }`
      : nextChargeLabel;
  return (
    <MiniAppListCard
      icon={Icon}
      tone={tone}
      title={row.loan.label}
      subtitle={subtitle}
      primaryValue={`−${ILS.format(row.monthlyAmount)}`}
      primaryCaption="/חודש"
      progress={progress}
      progressLabel={progressLabel}
      status={{ tone, label: LOAN_STATUS_LABEL[row.status] }}
      onClick={onClick}
    />
  );
}

function _UnusedCalendarRef(): null {
  // Tree-shake guard so the lucide import that future variants will
  // reuse stays in the chunk.
  void CalendarCheck2;
  return null;
}
void _UnusedCalendarRef;
