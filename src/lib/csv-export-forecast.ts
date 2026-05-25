// Phase 219 — CSV exports for cash-flow buckets + liquidity curve.
//
// Reuses the entry-export download helper pattern from csv-export.ts:
// UTF-8 BOM, RFC 4180 quoting via escapeField, browser-only trigger.
//
// Two surfaces:
//   * bucketsToCsv(report)   one row per obligation, grouped via
//                            bucket label so the user reads
//                            "Isracard / Insurance / 2026-05-24 / 800"
//                            without us inventing nested CSV.
//   * curveToCsv(curve)      one row per LiquidityPoint with per-day
//                            balance + delta + comma-joined event
//                            labels. Useful for spreadsheet plotting.

import type { CashFlowBucketsReport } from "@/lib/cash-flow-bucket";
import type { LiquidityCurve } from "@/lib/liquidity-curve";
import { escapeField } from "@/lib/csv-export";

const BUCKETS_HEADER = [
  "bucket_id",
  "bucket_label",
  "source",
  "card_last4",
  "obligation_label",
  "obligation_kind",
  "amount_ils",
  "effective_cash_at",
  "ref_id",
];

export function bucketsToCsv(report: CashFlowBucketsReport): string {
  const lines = [BUCKETS_HEADER.join(",")];
  for (const bucket of report.buckets) {
    for (const ob of bucket.obligations) {
      lines.push(
        [
          bucket.id,
          bucket.label,
          bucket.source,
          bucket.cardLast4 ?? "",
          ob.label,
          ob.kind,
          ob.amount,
          ob.effectiveCashAt,
          ob.refId,
        ]
          .map(escapeField)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

const CURVE_HEADER = [
  "day_index",
  "when_iso",
  "balance_ils",
  "delta_ils",
  "events",
];

export function curveToCsv(curve: LiquidityCurve): string {
  const lines = [CURVE_HEADER.join(",")];
  for (const p of curve.points) {
    const events = p.events
      .map(
        (e) =>
          `${e.kind}:${e.label}:${e.amount > 0 ? "+" : ""}${Math.round(
            e.amount,
          )}`,
      )
      .join("; ");
    lines.push(
      [
        p.dayIndex,
        p.whenISO,
        p.balance,
        p.delta,
        events,
      ]
        .map(escapeField)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Browser-only download trigger. Adds UTF-8 BOM so Excel renders
 *  Hebrew labels correctly. */
export function downloadCsv(args: { csv: string; filename: string }): void {
  if (typeof window === "undefined") return;
  const blob = new Blob(["﻿" + args.csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
