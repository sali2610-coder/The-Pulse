import { CalendarCheck2, Coins } from "lucide-react";
import type { InstallmentSummary } from "@/lib/installment-summary";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
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

/**
 * Compact installment-deal context block. Renders the full picture
 * (paid so far, remaining, projected end) for a single installment-
 * mode RecurringRule or Loan.
 *
 * Pure presentation — accepts the derived InstallmentSummary and
 * lays it out as a 4-column grid + meta row. Reused across the
 * recurring rules panel and the loans panel so the language stays
 * consistent.
 */
export function InstallmentSummaryBlock({
  summary,
  accent = "#D4AF37",
}: {
  summary: InstallmentSummary;
  accent?: string;
}) {
  const pct =
    summary.installmentCount > 0
      ? Math.min(
          100,
          Math.round(
            (summary.installmentsPaid / summary.installmentCount) * 100,
          ),
        )
      : 0;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Coins className="size-2.5" />
          סיכום עסקה
        </span>
        <span data-mono="true">
          {summary.installmentsPaid}/{summary.installmentCount}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}66)`,
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Tile label="עסקה כוללת" value={ILS.format(summary.totalDealAmount)} />
        <Tile
          label="כבר שולם"
          value={ILS.format(summary.totalAlreadyPaid)}
          tone="green"
        />
        <Tile
          label="נותר"
          value={ILS.format(summary.totalRemaining)}
          tone="red"
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarCheck2 className="size-2.5" />
          סיום צפוי
        </span>
        <span data-mono="true" dir="ltr">
          {formatMonthKey(summary.projectedEndMonthKey)}
        </span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "#34D399"
      : tone === "red"
        ? "#F87171"
        : "#E4E7EC";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/6 bg-background/30 px-2 py-1.5">
      <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[11.5px] font-semibold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
