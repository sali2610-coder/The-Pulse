"use client";

// Generic dated obligation row for the ForecastTimelineCard. Renders
// day pill + label + amount, with tone-tinted accent dot derived
// from the event kind. Built as a thin presentational primitive so
// any future timeline (recurring calendar, salary history, etc.)
// can reuse the same shape.

import { cn } from "@/lib/utils";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(n))}`;
}

type Props = {
  day: number;
  label: string;
  amount: number;
  meta?: string;
  /** Hex tint for the left accent dot. Reuses category accent colors
   *  when callable. */
  accent?: string;
  className?: string;
};

export function TimelineRow({ day, label, amount, meta, accent, className }: Props) {
  const positive = amount > 0;
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-white/8 bg-black/25 p-2.5 transition-colors hover:border-white/14",
        className,
      )}
    >
      <div className="flex w-9 shrink-0 flex-col items-center rounded-lg bg-white/5 py-1">
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          יום
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[14px] font-semibold leading-none text-foreground"
        >
          {day}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <div className="flex items-center gap-1.5">
          {accent ? (
            <span
              aria-hidden
              className="inline-flex size-1.5 rounded-full"
              style={{ background: accent }}
            />
          ) : null}
          <span className="truncate text-[12px] font-medium text-foreground">
            {label}
          </span>
        </div>
        {meta ? (
          <span className="text-[10px] text-muted-foreground/85">{meta}</span>
        ) : null}
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="shrink-0 text-[12.5px] font-medium"
        style={{ color: positive ? "#34D399" : "#F87171" }}
      >
        {signed(amount)}
      </span>
    </li>
  );
}
