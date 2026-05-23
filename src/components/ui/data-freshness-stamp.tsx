"use client";

// Tiny "how current is this?" stamp shown under primary cards.
// Designed to be visually quiet — no icon, no border by default —
// because the user only needs to find it when they doubt the number.

import { Clock } from "lucide-react";
import type { FreshnessReport } from "@/lib/data-freshness";

const REL = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "עוד לא סונכרן";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return REL.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return REL.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return REL.format(-days, "day");
}

const TONE: Record<FreshnessReport["bucket"], string> = {
  fresh: "#34D399",
  ok: "#D4AF37",
  stale: "#A1A1AA",
};

type Props = {
  freshness: FreshnessReport;
};

export function DataFreshnessStamp({ freshness }: Props) {
  const tone = TONE[freshness.bucket];
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/85"
      dir="rtl"
    >
      <span
        aria-hidden
        className="inline-flex size-1.5 rounded-full"
        style={{ background: tone }}
      />
      <Clock className="size-2.5" aria-hidden />
      <span>סונכרן {ageLabel(freshness.ageOfLastSyncSeconds)}</span>
      <span aria-hidden>·</span>
      <span>{freshness.projectedThroughText}</span>
      {freshness.nextIncomeDay !== null ? (
        <>
          <span aria-hidden>·</span>
          <span>הכנסה הבאה ביום {freshness.nextIncomeDay}</span>
        </>
      ) : null}
      {freshness.nextObligationDay !== null ? (
        <>
          <span aria-hidden>·</span>
          <span>חיוב הבא ביום {freshness.nextObligationDay}</span>
        </>
      ) : null}
    </div>
  );
}
