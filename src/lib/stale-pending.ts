// Stale-pending detector.
//
// Wallet partials that landed via push but never got reviewed grow
// stale. The PendingTray itself doesn't dim them; this helper
// surfaces a count so the UI can nudge the user toward action
// (confirm or dismiss) once a row has been sitting for ≥ N days.
//
// Pure compute — no mutation, no persistence.

import type { ExpenseEntry } from "@/types/finance";

export type StalePending = {
  entryId: string;
  daysOld: number;
  amount: number;
};

const DEFAULT_THRESHOLD_DAYS = 3;

export function detectStalePending(args: {
  entries: ExpenseEntry[];
  now?: Date;
  thresholdDays?: number;
}): StalePending[] {
  const now = (args.now ?? new Date()).getTime();
  const threshold = args.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  const out: StalePending[] = [];
  for (const entry of args.entries) {
    if (!entry.needsConfirmation || entry.confirmedAt) continue;
    const created = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(created)) continue;
    const daysOld = Math.floor((now - created) / 86_400_000);
    if (daysOld < threshold) continue;
    out.push({
      entryId: entry.id,
      daysOld,
      amount: entry.amount,
    });
  }
  out.sort((a, b) => b.daysOld - a.daysOld);
  return out;
}
