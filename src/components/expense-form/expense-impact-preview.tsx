"use client";

// Phase 244 — pre-save impact preview.
//
// Shows the user exactly what their pending expense will do to the
// finances BEFORE they hit save:
//   • per-installment monthly amount when installments > 1
//   • next debit date based on the chosen source account's billing
//     / payment day
//   • projected future-balance delta on the next salary date
// Pure read — no mutation. Uses the existing effective-cash-date
// helpers so the preview math matches the rest of the dashboard.

import { useMemo } from "react";
import { CalendarClock, Layers, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { effectiveCashImpacts } from "@/lib/effective-cash-date";
import { getCategory, type CategoryId } from "@/lib/categories";
import type { ExpenseEntry, PaymentMethod } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

export function ExpenseImpactPreview({
  amount,
  category,
  paymentMethod,
  accountId,
  installments,
  source,
}: {
  amount: number | undefined;
  category: CategoryId | undefined;
  paymentMethod: PaymentMethod;
  accountId: string | undefined;
  installments: number;
  source: "cash" | "bank" | "card";
}) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const data = useMemo(() => {
    if (!hydrated || !amount || amount <= 0 || !category) return null;

    // Build a hypothetical entry that mirrors the form state. The
    // engine reads only the fields that drive scheduling — id /
    // createdAt are placeholders here.
    const hypothetical: ExpenseEntry = {
      id: "preview",
      amount,
      category,
      source: "manual",
      paymentMethod,
      installments,
      chargeDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      accountId,
    };

    const impacts = effectiveCashImpacts({
      entry: hypothetical,
      accounts,
    });
    const monthly =
      installments > 1 ? amount / installments : amount;
    const nextHit = impacts[0]?.effectiveCashDate ?? null;

    // Run two future-balance projections (with + without this
    // entry) and report the delta on the next salary day.
    const baseline = liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
    });
    const withEntry = liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries: [...entries, hypothetical],
    });
    const target = baseline.nextSalaryAt
      ? baseline.points.findIndex(
          (p) => p.whenISO === baseline.nextSalaryAt,
        )
      : Math.min(30, baseline.points.length - 1);
    const baseBalance =
      target >= 0 ? baseline.points[target].balance : baseline.startingBalance;
    const newBalance =
      target >= 0
        ? withEntry.points[target].balance
        : withEntry.startingBalance;

    const cardAcc =
      source === "card" && accountId
        ? accounts.find((a) => a.id === accountId)
        : null;
    const cardLabel = cardAcc?.label;

    return {
      monthly,
      installmentsCount: installments,
      nextHit,
      cardLabel,
      baseBalance,
      newBalance,
      targetISO:
        target >= 0 ? baseline.points[target].whenISO : null,
    };
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    amount,
    category,
    paymentMethod,
    accountId,
    installments,
    source,
  ]);

  if (!data) return null;

  const meta = category ? getCategory(category) : null;
  const delta = data.newBalance - data.baseBalance;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/25 p-3">
      <span className="text-micro text-muted-foreground">השפעה צפויה</span>

      {data.installmentsCount > 1 ? (
        <Row
          icon={<Layers className="size-4" />}
          label={`${data.installmentsCount} תשלומים חודשיים`}
          value={`${ILS.format(Math.round(data.monthly))}/חודש`}
        />
      ) : null}

      {data.cardLabel && data.nextHit ? (
        <Row
          icon={<CalendarClock className="size-4" />}
          label={`חיוב ${data.cardLabel}`}
          value={DAY_FMT.format(data.nextHit)}
        />
      ) : null}

      {meta ? (
        <Row
          icon={
            <span
              className="flex size-4 items-center justify-center rounded-full"
              style={{ background: meta.accent }}
            />
          }
          label={`${meta.label} החודש`}
          value={ILS.format(Math.round(data.monthly))}
        />
      ) : null}

      {data.targetISO ? (
        <Row
          icon={<Wallet className="size-4" />}
          label={`צפי חשבון ב-${DAY_FMT.format(new Date(data.targetISO))}`}
          value={`${delta < 0 ? "" : "+"}${ILS.format(
            Math.round(delta),
          )}`}
          tone={delta < 0 ? "neg" : "neutral"}
        />
      ) : null}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neg" | "pos" | "neutral";
}) {
  const color =
    tone === "neg" ? "#F87171" : tone === "pos" ? "#34D399" : undefined;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-caption text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-caption font-medium text-foreground"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
