// Bank-anchor staleness detector.
//
// The CFO forecast leans on the user-typed `anchorBalance` as the
// ground-truth starting point. Once that anchor goes stale, every
// downstream projection (EOM, daily allowance, net worth) drifts
// from reality. This helper flags anchors that haven't been touched
// in a configurable number of days so the user gets a nudge to
// refresh them.
//
// Pure compute — no mutation, no persistence.

import type { Account } from "@/types/finance";

export type StaleAnchor = {
  accountId: string;
  label: string;
  anchorBalance: number;
  anchorUpdatedAt: string;
  daysSinceUpdate: number;
  severity: "watch" | "alert";
};

const DEFAULT_WATCH = 14;
const DEFAULT_ALERT = 30;

export function detectStaleAnchors(args: {
  accounts: Account[];
  now?: Date;
  watchDays?: number;
  alertDays?: number;
}): StaleAnchor[] {
  const now = args.now ?? new Date();
  const watch = args.watchDays ?? DEFAULT_WATCH;
  const alert = args.alertDays ?? DEFAULT_ALERT;
  const out: StaleAnchor[] = [];
  for (const acc of args.accounts) {
    if (!acc.active) continue;
    if (acc.kind !== "bank") continue;
    if (typeof acc.anchorBalance !== "number") continue;
    if (!acc.anchorUpdatedAt) continue;
    const updated = new Date(acc.anchorUpdatedAt);
    if (Number.isNaN(updated.getTime())) continue;
    const daysSinceUpdate = Math.floor(
      (now.getTime() - updated.getTime()) / 86_400_000,
    );
    if (daysSinceUpdate < watch) continue;
    const severity: StaleAnchor["severity"] =
      daysSinceUpdate >= alert ? "alert" : "watch";
    out.push({
      accountId: acc.id,
      label: acc.label,
      anchorBalance: acc.anchorBalance,
      anchorUpdatedAt: acc.anchorUpdatedAt,
      daysSinceUpdate,
      severity,
    });
  }
  out.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
  return out;
}
