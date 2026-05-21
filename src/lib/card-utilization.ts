// Credit-card utilization — % of credit line currently consumed.
//
// Layers on top of Phase 90 metadata (`creditLimit`, `currentDebt`) and
// the Phase 100 cycle projection. Returns null whenever the card lacks
// `creditLimit` so the UI can hide the surface gracefully.
//
// Pure compute — no mutation, no persistence.

import type { Account } from "@/types/finance";
import type { CardCycleProjection } from "@/lib/card-cycle";

export type UtilizationSeverity = "calm" | "watch" | "warn" | "alert";

export type CardUtilization = {
  accountId: string;
  limit: number;
  /** Headline "used" value — prefers `currentDebt` (user-tracked), falls
   *  back to the cycle projection so the gauge still works without
   *  manual debt entry. */
  used: number;
  /** used / limit, clamped to >= 0. May exceed 1 when over-limit. */
  ratio: number;
  severity: UtilizationSeverity;
  /** When debt source = "debt", `used` came from currentDebt;
   *  "cycle" → it's the cycle projection. */
  source: "debt" | "cycle";
};

const WATCH_RATIO = 0.5;
const WARN_RATIO = 0.7;
const ALERT_RATIO = 0.9;

function severityFor(ratio: number): UtilizationSeverity {
  if (ratio >= ALERT_RATIO) return "alert";
  if (ratio >= WARN_RATIO) return "warn";
  if (ratio >= WATCH_RATIO) return "watch";
  return "calm";
}

export type AggregateUtilization = {
  totalUsed: number;
  totalLimit: number;
  ratio: number;
  severity: UtilizationSeverity;
  /** Number of cards that contributed (active + creditLimit > 0). */
  cardCount: number;
};

export function aggregateCardUtilization(args: {
  accounts: Account[];
  projectionsById?: Map<string, CardCycleProjection | undefined>;
}): AggregateUtilization | null {
  let totalUsed = 0;
  let totalLimit = 0;
  let cardCount = 0;
  for (const a of args.accounts) {
    if (a.kind !== "card") continue;
    if (!a.active) continue;
    if (!a.creditLimit || a.creditLimit <= 0) continue;
    const projection = args.projectionsById?.get(a.id);
    const util = cardUtilization({
      account: a,
      cycleProjection: projection ?? undefined,
    });
    if (!util) continue;
    totalUsed += util.used;
    totalLimit += util.limit;
    cardCount += 1;
  }
  if (cardCount === 0 || totalLimit <= 0) return null;
  const ratio = Math.max(0, totalUsed / totalLimit);
  return {
    totalUsed,
    totalLimit,
    ratio,
    severity: severityFor(ratio),
    cardCount,
  };
}

export function cardUtilization(args: {
  account: Account;
  cycleProjection?: CardCycleProjection;
}): CardUtilization | null {
  const { account, cycleProjection } = args;
  if (account.kind !== "card") return null;
  if (!account.creditLimit || account.creditLimit <= 0) return null;

  let used = 0;
  let source: CardUtilization["source"] = "cycle";
  if (typeof account.currentDebt === "number" && account.currentDebt > 0) {
    used = account.currentDebt;
    source = "debt";
  } else if (cycleProjection && cycleProjection.projectedAmount > 0) {
    used = cycleProjection.projectedAmount;
    source = "cycle";
  } else {
    used = 0;
    source = "cycle";
  }

  const ratio = Math.max(0, used / account.creditLimit);
  return {
    accountId: account.id,
    limit: account.creditLimit,
    used,
    ratio,
    severity: severityFor(ratio),
    source,
  };
}
