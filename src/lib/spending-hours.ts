// Time-of-day spending intelligence.
//
// Aggregates the last 90 days of entries into 4 coarse buckets:
//   morning   05–12
//   afternoon 12–17
//   evening   17–21
//   night     21–05
//
// Returns:
//   - perBucket totals (count + amount)
//   - mostActiveBucket   — bucket with the highest charge COUNT
//   - highestSpendBucket — bucket with the highest charge AMOUNT
//   - weekdayShare       — share of count + amount that lands Mon–Thu
//   - weekendShare       — share that lands Fri–Sat (Israeli weekend)
//   - hasEnoughData      — true once ≥10 qualifying entries exist
//
// Pure. No store access. Card auto-hides when hasEnoughData is false.

import type { ExpenseEntry } from "@/types/finance";

export type HourBucket = "morning" | "afternoon" | "evening" | "night";

export type HourBucketSummary = {
  bucket: HourBucket;
  label: string;
  count: number;
  amount: number;
};

export type WeekdaySplit = {
  weekday: { count: number; amount: number; share: number };
  weekend: { count: number; amount: number; share: number };
};

export type SpendingHoursReport = {
  buckets: HourBucketSummary[];
  mostActiveBucket: HourBucket | null;
  highestSpendBucket: HourBucket | null;
  split: WeekdaySplit;
  totalEntries: number;
  hasEnoughData: boolean;
};

const LOOKBACK_DAYS = 90;
const MIN_ENTRIES = 10;

const LABELS: Record<HourBucket, string> = {
  morning: "בוקר (05–12)",
  afternoon: "צהריים (12–17)",
  evening: "ערב (17–21)",
  night: "לילה (21–05)",
};

export function spendingHours(args: {
  entries: ExpenseEntry[];
  now?: Date;
}): SpendingHoursReport {
  const now = args.now ?? new Date();
  const cutoffMs = now.getTime() - LOOKBACK_DAYS * 86_400_000;

  const counts: Record<HourBucket, { count: number; amount: number }> = {
    morning: { count: 0, amount: 0 },
    afternoon: { count: 0, amount: 0 },
    evening: { count: 0, amount: 0 },
    night: { count: 0, amount: 0 },
  };
  let weekdayCount = 0;
  let weekendCount = 0;
  let weekdayAmount = 0;
  let weekendAmount = 0;
  let total = 0;

  for (const e of args.entries) {
    if (e.isRefund) continue;
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const ts = new Date(e.chargeDate);
    if (Number.isNaN(ts.getTime())) continue;
    if (ts.getTime() < cutoffMs) continue;
    if (ts.getTime() > now.getTime()) continue; // ignore future-dated slices
    const slot = bucketFor(ts.getHours());
    const amt = e.amount / Math.max(1, e.installments);
    counts[slot].count += 1;
    counts[slot].amount += amt;
    total += 1;
    const dow = ts.getDay(); // 0=Sun .. 6=Sat
    // Israeli weekend = Friday(5) + Saturday(6).
    if (dow === 5 || dow === 6) {
      weekendCount++;
      weekendAmount += amt;
    } else {
      weekdayCount++;
      weekdayAmount += amt;
    }
  }

  const buckets: HourBucketSummary[] = (Object.keys(counts) as HourBucket[]).map(
    (b) => ({
      bucket: b,
      label: LABELS[b],
      count: counts[b].count,
      amount: Math.round(counts[b].amount * 100) / 100,
    }),
  );

  const mostActive = winner(buckets, (x) => x.count);
  const highestSpend = winner(buckets, (x) => x.amount);
  const totalCount = weekdayCount + weekendCount;
  const totalAmt = weekdayAmount + weekendAmount;

  return {
    buckets,
    mostActiveBucket: mostActive,
    highestSpendBucket: highestSpend,
    split: {
      weekday: {
        count: weekdayCount,
        amount: Math.round(weekdayAmount * 100) / 100,
        share: totalCount > 0 ? weekdayCount / totalCount : 0,
      },
      weekend: {
        count: weekendCount,
        amount: Math.round(weekendAmount * 100) / 100,
        share: totalAmt > 0 ? weekendAmount / totalAmt : 0,
      },
    },
    totalEntries: total,
    hasEnoughData: total >= MIN_ENTRIES,
  };
}

function bucketFor(hour: number): HourBucket {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function winner(
  rows: HourBucketSummary[],
  pick: (r: HourBucketSummary) => number,
): HourBucket | null {
  let best: HourBucketSummary | null = null;
  let bestVal = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v > bestVal) {
      best = r;
      bestVal = v;
    }
  }
  return best?.bucket ?? null;
}
