"use client";

// Phase 229 — live preview of what a typed budget target implies.
//
// The budget input was a write-only shell — the user typed a number,
// pressed save, and had to leave Settings to see whether the target
// was realistic. This panel renders the live consequences of the
// DRAFT value (not the saved one) using the existing engines:
//
//   * dailyAllowance       → how much per day this target leaves.
//   * forecastEndOfMonth   → projected cash position at month-end.
//   * pendingFixed + loans + futureCardSlices (from forecast) →
//     known committed outflows. If draftBudget < committed, the
//     target is impossible and we flag it.
//
// Pure render. No store mutation — Save still goes through the
// existing BudgetEditor button.

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { dailyAllowance, forecastEndOfMonth } from "@/lib/forecast";
import { projectMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function BudgetPreview({ draftBudget }: { draftBudget: number }) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const data = useMemo(() => {
    if (!hydrated) return null;
    const monthKey = monthKeyOf(new Date());
    const allowance = dailyAllowance({
      entries,
      rules,
      statuses,
      monthlyBudget: draftBudget,
      monthKey,
    });
    const forecast = forecastEndOfMonth({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey,
    });
    const proj = projectMonth({
      entries,
      rules,
      statuses,
      monthKey,
    });
    const committed = proj.actual + proj.upcoming;
    const impossible = draftBudget > 0 && draftBudget < committed;
    const tight =
      !impossible && draftBudget > 0 && allowance.allowance < 30;
    return {
      allowance: allowance.allowance,
      daysRemaining: allowance.daysRemaining,
      committed,
      forecast: forecast.forecast,
      impossible,
      tight,
    };
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    draftBudget,
  ]);

  if (!hydrated || !data || draftBudget <= 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/25 p-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        מה היעד הזה אומר
      </div>

      <Row
        label="מותר ביום"
        value={ILS.format(Math.round(data.allowance))}
        sub={`למשך ${data.daysRemaining} ימים`}
        tone={data.allowance < 20 ? "warn" : "ok"}
      />
      <Row
        label="כבר משוריין החודש"
        value={ILS.format(Math.round(data.committed))}
        sub="פעולות שכבר חויבו + צפויות לחייב"
        tone="info"
      />
      <Row
        label="צפי סוף חודש בבנק"
        value={ILS.format(Math.round(data.forecast))}
        tone={data.forecast < 0 ? "danger" : "ok"}
      />

      {data.impossible ? (
        <Banner
          tone="danger"
          icon={<AlertTriangle className="size-4" />}
          title="היעד נמוך מההתחייבויות הקבועות"
          detail={`כבר משוריינים ${ILS.format(Math.round(data.committed))} החודש. בחר יעד גבוה יותר או שקול להפחית הוצאות קבועות.`}
        />
      ) : data.tight ? (
        <Banner
          tone="warn"
          icon={<Info className="size-4" />}
          title="היעד נמוך משמעותית"
          detail={`נשארים פחות מ-30₪ ליום. ייתכן שתחרוג מהיעד.`}
        />
      ) : (
        <Banner
          tone="ok"
          icon={<CheckCircle2 className="size-4" />}
          title="היעד בר-ביצוע"
          detail="קצב יומי סביר מול ההתחייבויות הקיימות."
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "ok" | "warn" | "danger" | "info";
}) {
  const color =
    tone === "danger"
      ? "#F87171"
      : tone === "warn"
        ? "#F59E0B"
        : tone === "ok"
          ? "#34D399"
          : undefined;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] text-foreground">{label}</span>
        {sub ? (
          <span className="truncate text-[11px] text-muted-foreground/80">
            {sub}
          </span>
        ) : null}
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="shrink-0 text-[14px] font-medium"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  detail,
}: {
  tone: "ok" | "warn" | "danger";
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  const color =
    tone === "danger" ? "#F87171" : tone === "warn" ? "#F59E0B" : "#34D399";
  return (
    <div
      className="flex items-start gap-2 rounded-xl border p-2.5"
      style={{
        borderColor: `${color}44`,
        background: `${color}10`,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[12.5px] font-medium" style={{ color }}>
          {title}
        </span>
        <span className="text-[11.5px] text-muted-foreground/85">{detail}</span>
      </div>
    </div>
  );
}
