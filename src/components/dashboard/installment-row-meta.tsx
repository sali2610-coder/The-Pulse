"use client";

// Phase 269 — visual block for an installment row.
//
// Two compact lines under the row label so the user reads:
//   1. "תשלום 3 מתוך 12 · נותרו 9"
//   2. "300₪ לחודש · סה״כ 3,600₪"
// Calm hierarchy — no giant pills. Amber accent reuses the
// "תשלומים" stat color from the card hierarchy so the eye learns
// "amber = installment" across the app.

import { Layers } from "lucide-react";

import type { InstallmentMeta } from "@/lib/installment-meta";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ACCENT = "#F59E0B";

export function InstallmentBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        background: `${ACCENT}1f`,
        color: ACCENT,
      }}
      aria-label="תשלום בפריסה"
    >
      <Layers className="size-3" />
      תשלום
    </span>
  );
}

export function InstallmentMetaLines({ meta }: { meta: InstallmentMeta }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground/80">
      <span style={{ color: ACCENT }}>
        תשלום {meta.current} מתוך {meta.total}
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span>נותרו {meta.remaining}</span>
      <span className="text-muted-foreground/60">·</span>
      <span data-mono="true" dir="ltr">
        {ILS.format(Math.round(meta.monthly))}/חודש
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span data-mono="true" dir="ltr">
        סה״כ {ILS.format(Math.round(meta.originalTotal))}
      </span>
    </span>
  );
}
