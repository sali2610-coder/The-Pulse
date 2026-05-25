// CSV export.
//
// Complement to the existing Statement CSV import. Produces a
// spreadsheet-friendly export of every ExpenseEntry — useful for
// the user's own tax / annual review work, and as a portable
// long-term archive.
//
// Pure compute. RFC 4180 quoting: fields containing comma, quote,
// CR, or LF get wrapped in double quotes and embedded quotes are
// doubled. Header row included.

import type { ExpenseEntry } from "@/types/finance";

const HEADER = [
  "id",
  "chargeDate",
  "amount",
  "category",
  "paymentMethod",
  "installments",
  "merchant",
  "issuer",
  "cardLast4",
  "accountId",
  "source",
  "externalId",
  "matchedRuleId",
  "isRefund",
  "currency",
  "bankPending",
  "needsConfirmation",
  "confirmedAt",
  "excludeFromBudget",
  "note",
  "createdAt",
];

export function escapeField(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  // Per RFC 4180: quote fields containing comma, quote, CR, or LF.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowFor(entry: ExpenseEntry): string[] {
  return [
    entry.id,
    entry.chargeDate,
    entry.amount,
    entry.category,
    entry.paymentMethod,
    entry.installments,
    entry.merchant ?? "",
    entry.issuer ?? "",
    entry.cardLast4 ?? "",
    entry.accountId ?? "",
    entry.source,
    entry.externalId ?? "",
    entry.matchedRuleId ?? "",
    entry.isRefund ? "true" : "",
    entry.currency ?? "",
    entry.bankPending ? "true" : "",
    entry.needsConfirmation ? "true" : "",
    entry.confirmedAt ?? "",
    entry.excludeFromBudget ? "true" : "",
    entry.note ?? "",
    entry.createdAt,
  ].map((v) => escapeField(v));
}

/** Render the full entry log to a CSV string. Order: chronological
 *  by chargeDate ASC then createdAt ASC so the export reads top-to-
 *  bottom like a bank statement. */
export function entriesToCsv(entries: ExpenseEntry[]): string {
  const sorted = entries.slice().sort((a, b) => {
    const ad = a.chargeDate.localeCompare(b.chargeDate);
    if (ad !== 0) return ad;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const lines = [HEADER.join(",")];
  for (const e of sorted) {
    lines.push(rowFor(e).join(","));
  }
  // Trailing newline so editors don't complain about missing EOL.
  return lines.join("\n") + "\n";
}

/** Browser-only helper: trigger a download of the rendered CSV.
 *  No-ops outside a browser context. */
export function downloadEntriesCsv(
  entries: ExpenseEntry[],
  filename = "sally-entries.csv",
): void {
  if (typeof window === "undefined") return;
  const csv = entriesToCsv(entries);
  // BOM so Excel auto-detects UTF-8 with Hebrew text.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
