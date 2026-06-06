"use client";

// Phase 414 — Income folder as a mini-app.
//
// Hero KPIs: צפי החודש + התקבל החודש + variance ("חסר ₪600 ב-N
// ימים"). Per-source card with actual-vs-expected. Tap → fullscreen
// edit. Inline "סמן כהתקבל" button below each card (uses
// store.setIncomeActual w/ the income's base amount).

import { useMemo, useState } from "react";
import { BadgeCheck, CalendarCheck2, HandCoins } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getMonthlyIncome,
} from "@/lib/financial-engine";
import { currentMonthKey, dayWithinMonth } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppHero,
  MiniAppListCard,
  type MiniAppKpi,
} from "@/components/ui/mini-app-shell";
import { IncomeFullScreenEdit } from "@/components/income/income-fullscreen-edit";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import { toast } from "sonner";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE = "#FACC15";

export function IncomeMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const loans = useFinanceStore((s) => s.loans);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthKey = currentMonthKey();
  const now = useMemo(() => new Date(), []);

  const totalExpected = incomes
    .filter((i) => i.active && i.amount > 0)
    .reduce((s, i) => s + i.amount, 0);

  const ctx = useMemo(() => {
    if (!hydrated) return null;
    return buildEngineCtx({
      accounts,
      rules,
      statuses,
      entries,
      loans,
      incomes,
      monthlyBudget,
    });
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
  const totalActualThisMonth = ctx
    ? getMonthlyIncome(ctx).total
    : totalExpected;

  function openAdd() {
    setEditingId(null);
    setEditOpen(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setEditOpen(true);
  }

  function markReceived(incomeId: string, amount: number) {
    hapticTap();
    setIncomeActual(incomeId, monthKey, amount);
    hapticSuccess();
    toast.success("נסמן כהתקבל");
  }

  if (!hydrated) return null;

  const variance = totalActualThisMonth - totalExpected;
  const varianceCaption =
    variance === 0
      ? "כצפי בדיוק"
      : variance > 0
        ? `+${ILS.format(variance)} מעל הצפי`
        : `${ILS.format(variance)} מתחת לצפי`;

  const kpis: MiniAppKpi[] = [
    {
      label: "צפי החודש",
      value: ILS.format(totalExpected),
      tone: TONE,
      emphasis: true,
      caption:
        incomes.filter((i) => i.active).length === 0
          ? "אין הכנסות פעילות"
          : `${incomes.filter((i) => i.active).length} מקורות פעילים`,
    },
    {
      label: "התקבל בפועל",
      value: ILS.format(Math.round(totalActualThisMonth)),
      tone: "#34D399",
      caption: varianceCaption,
    },
  ];

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppHero
        title="הכנסות"
        subtitle="צפי חודשי + מעקב אחרי מה שכבר התקבל."
        kpis={kpis}
      />

      {incomes.length === 0 ? (
        <MiniAppEmpty
          icon={HandCoins}
          title="עוד אין הכנסות"
          body="הוסף משכורת / פנסיה / צד-משלח. Pulse יציג את ההכנסה הקרובה על ציר הזמן ויחזה את היתרה לסוף החודש."
          cta={{ label: "הוסף הכנסה", onClick: openAdd }}
        />
      ) : (
        <>
          <MiniAppAddCta label="הוסף הכנסה" onClick={openAdd} />
          <ul className="flex flex-col gap-2">
            {incomes.map((inc) => {
              const expectedThisMonth = inc.amount;
              const actualThisMonth = incomeForMonth(inc, monthKey);
              const hasActual = inc.actualByMonth?.[monthKey] !== undefined;
              const payday = dayWithinMonth(monthKey, inc.dayOfMonth);
              const isFuture = payday.getTime() > now.getTime();
              const daysToPayday = Math.max(
                0,
                Math.floor((payday.getTime() - now.getTime()) / 86_400_000),
              );
              const subtitle = isFuture
                ? daysToPayday === 0
                  ? "מועד התשלום היום"
                  : daysToPayday === 1
                    ? "מחר"
                    : `בעוד ${daysToPayday} ימים · יום ${inc.dayOfMonth}`
                : hasActual
                  ? `יום ${inc.dayOfMonth} · התקבל`
                  : `יום ${inc.dayOfMonth} · עבר ${Math.abs(daysToPayday)} ימים`;
              const status = !inc.active
                ? { tone: "#A1A1AA", label: "מושהה" }
                : hasActual
                  ? { tone: "#34D399", label: "התקבל" }
                  : isFuture
                    ? { tone: TONE, label: "צפי" }
                    : { tone: "#F87171", label: "ממתין" };
              const primaryCaption = hasActual
                ? actualThisMonth === expectedThisMonth
                  ? "כצפי"
                  : actualThisMonth > expectedThisMonth
                    ? `+${ILS.format(actualThisMonth - expectedThisMonth)}`
                    : `−${ILS.format(expectedThisMonth - actualThisMonth)}`
                : "/חודש";
              return (
                <li key={inc.id} className="flex flex-col gap-1.5">
                  <MiniAppListCard
                    icon={hasActual ? BadgeCheck : CalendarCheck2}
                    tone={inc.active ? TONE : "#A1A1AA"}
                    title={inc.label}
                    subtitle={subtitle}
                    primaryValue={`+${ILS.format(hasActual ? actualThisMonth : expectedThisMonth)}`}
                    primaryCaption={primaryCaption}
                    status={status}
                    onClick={() => openEdit(inc.id)}
                  />
                  {!hasActual && inc.active ? (
                    <button
                      type="button"
                      onClick={() => markReceived(inc.id, inc.amount)}
                      className="self-end rounded-full border border-[#34D399]/40 bg-[#34D399]/[0.08] px-3 py-1 text-[11px] text-[#34D399] transition-colors hover:border-[#34D399]/70 hover:bg-[#34D399]/[0.12]"
                    >
                      ✓ סמן כהתקבל
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <IncomeFullScreenEdit
        incomeId={editingId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingId(null);
        }}
      />
    </div>
  );
}
