// Lightweight daily-insight generator.
//
// Walks the entry log + an optional rules list and emits a short
// ordered list of Hebrew observations the timeline UI surfaces:
//
//   - today_above_average   "היום הוצאת יותר מהממוצע"
//   - dormant_merchant      "לא ביקרת ב-X כבר Y יום"
//   - duplicate_charges     "3 חיובים דומים זוהו השבוע"
//   - category_spike        "הוצאה חריגה בקטגוריית אוכל"
//   - busiest_day           "יום עם הכי הרבה הוצאות השבוע"
//
// Compute only. No AI. No store, no React.

import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { getCategory } from "@/lib/categories";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";

export type DailyInsightKind =
  | "today_above_average"
  | "dormant_merchant"
  | "duplicate_charges"
  | "category_spike"
  | "busiest_day";

export type DailyInsight = {
  kind: DailyInsightKind;
  severity: "info" | "watch" | "warn";
  /** Short Hebrew headline rendered verbatim. */
  text: string;
};

const LOOKBACK_DAYS = 30;
const DORMANT_MIN_VISITS = 3; // need ≥3 historical visits before flagging dormancy
const DORMANT_DAYS = 12;
const DUPLICATE_TOLERANCE = 1; // ±1 ILS for "looks similar"
const CATEGORY_SPIKE_RATIO = 1.6;

export function dailyInsights(args: {
  entries: ExpenseEntry[];
  rules?: RecurringRule[];
  now?: Date;
}): DailyInsight[] {
  const now = args.now ?? new Date();
  const todayStart = startOfDay(now).getTime();
  const tomorrowStart = todayStart + 86_400_000;
  const lookbackStart = todayStart - LOOKBACK_DAYS * 86_400_000;
  const weekStart = startOfWeek(now).getTime();

  const out: DailyInsight[] = [];

  const valid = args.entries.filter((e) => qualifies(e));

  // ── 1. today vs trailing average ─────────────────────────────────
  let todaySpend = 0;
  const pastSpendBydays = new Map<number, number>(); // dayStartMs → spend
  for (const e of valid) {
    if (e.isRefund) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (ts < lookbackStart || ts >= tomorrowStart) continue;
    const dayStart = startOfDay(new Date(ts)).getTime();
    if (dayStart === todayStart) {
      todaySpend += e.amount / Math.max(1, e.installments);
    } else {
      pastSpendBydays.set(
        dayStart,
        (pastSpendBydays.get(dayStart) ?? 0) +
          e.amount / Math.max(1, e.installments),
      );
    }
  }
  if (pastSpendBydays.size >= 5 && todaySpend > 0) {
    const past = [...pastSpendBydays.values()];
    const avg = past.reduce((a, b) => a + b, 0) / past.length;
    if (avg > 0 && todaySpend > avg * 1.4) {
      out.push({
        kind: "today_above_average",
        severity: "watch",
        text: `היום הוצאת ${roundILS(todaySpend)} ש"ח — מעל הממוצע היומי (${roundILS(avg)}).`,
      });
    }
  }

  // ── 2. busiest day this week ─────────────────────────────────────
  const weekTotals = new Map<number, number>();
  for (const e of valid) {
    if (e.isRefund) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (ts < weekStart || ts >= tomorrowStart) continue;
    const dayStart = startOfDay(new Date(ts)).getTime();
    weekTotals.set(
      dayStart,
      (weekTotals.get(dayStart) ?? 0) + e.amount / Math.max(1, e.installments),
    );
  }
  if (weekTotals.size >= 2) {
    let best: { day: number; total: number } | null = null;
    for (const [day, total] of weekTotals) {
      if (!best || total > best.total) best = { day, total };
    }
    // Only useful when it's clearly above the rest.
    if (best) {
      const others = [...weekTotals.values()].filter(
        (v) => v !== best!.total,
      );
      const restAvg =
        others.length > 0 ? others.reduce((a, b) => a + b, 0) / others.length : 0;
      if (best.total > restAvg * 1.3) {
        const lbl = WEEKDAY_FMT.format(new Date(best.day));
        out.push({
          kind: "busiest_day",
          severity: "info",
          text: `${lbl} היה היום עם הכי הרבה הוצאות השבוע (${roundILS(best.total)} ש"ח).`,
        });
      }
    }
  }

  // ── 3. dormant merchant (only when we have enough history) ───────
  // Use a 90-day window so a merchant last seen ~3 weeks ago still
  // counts. Independent of the 30-day average lookback above.
  const dormantWindowStart = todayStart - 90 * 86_400_000;
  const visits = new Map<string, { label: string; visits: number; lastTs: number }>();
  for (const e of valid) {
    if (e.isRefund) continue;
    const raw = e.merchant ?? e.note ?? "";
    const key = merchantKey(raw);
    if (!key) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (ts < dormantWindowStart) continue;
    const cur = visits.get(key);
    if (cur) {
      cur.visits++;
      if (ts > cur.lastTs) cur.lastTs = ts;
    } else {
      const label = sanitizeMerchant(raw) || raw.trim();
      visits.set(key, { label, visits: 1, lastTs: ts });
    }
  }
  // Pick the merchant with the most visits that hasn't been seen for
  // at least DORMANT_DAYS days. Top 1 only — list stays calm.
  let topDormant: { label: string; days: number; visits: number } | null = null;
  for (const v of visits.values()) {
    if (v.visits < DORMANT_MIN_VISITS) continue;
    const daysSince = Math.floor((now.getTime() - v.lastTs) / 86_400_000);
    if (daysSince < DORMANT_DAYS) continue;
    if (!topDormant || v.visits > topDormant.visits) {
      topDormant = { label: v.label, days: daysSince, visits: v.visits };
    }
  }
  if (topDormant) {
    out.push({
      kind: "dormant_merchant",
      severity: "info",
      text: `לא ביקרת ב־${topDormant.label} כבר ${topDormant.days} ימים.`,
    });
  }

  // ── 4. duplicate-looking charges this week ───────────────────────
  type Bucket = { amount: number; count: number };
  const dupBuckets = new Map<string, Bucket>();
  for (const e of valid) {
    if (e.isRefund) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (ts < weekStart || ts >= tomorrowStart) continue;
    const raw = e.merchant ?? e.note ?? "";
    const mk = merchantKey(raw);
    if (!mk) continue;
    const slot = `${mk}:${Math.round(e.amount / DUPLICATE_TOLERANCE)}`;
    const bucket = dupBuckets.get(slot);
    if (bucket) bucket.count++;
    else dupBuckets.set(slot, { amount: e.amount, count: 1 });
  }
  let dupHit: { count: number; amount: number } | null = null;
  for (const b of dupBuckets.values()) {
    if (b.count < 3) continue;
    if (!dupHit || b.count > dupHit.count) dupHit = { count: b.count, amount: b.amount };
  }
  if (dupHit) {
    out.push({
      kind: "duplicate_charges",
      severity: "watch",
      text: `${dupHit.count} חיובים דומים זוהו השבוע (סביב ${roundILS(dupHit.amount)} ש"ח). שווה לבדוק.`,
    });
  }

  // ── 5. category spike — today vs same category's 14-day avg ──────
  const catToday = new Map<CategoryId, number>();
  const catWindow = new Map<CategoryId, number>();
  for (const e of valid) {
    if (e.isRefund) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (ts < lookbackStart || ts >= tomorrowStart) continue;
    const amt = e.amount / Math.max(1, e.installments);
    const day = startOfDay(new Date(ts)).getTime();
    if (day === todayStart) {
      catToday.set(e.category, (catToday.get(e.category) ?? 0) + amt);
    } else {
      catWindow.set(e.category, (catWindow.get(e.category) ?? 0) + amt);
    }
  }
  let spike: { cat: CategoryId; today: number; avg: number } | null = null;
  for (const [cat, today] of catToday) {
    const windowSum = catWindow.get(cat) ?? 0;
    const avg = windowSum / Math.max(1, LOOKBACK_DAYS - 1);
    if (avg <= 0) continue;
    if (today < 50) continue; // ignore noise
    if (today >= avg * CATEGORY_SPIKE_RATIO) {
      if (!spike || today / avg > spike.today / spike.avg) {
        spike = { cat, today, avg };
      }
    }
  }
  if (spike) {
    const meta = getCategory(spike.cat);
    out.push({
      kind: "category_spike",
      severity: "warn",
      text: `הוצאה חריגה בקטגוריית ${meta.label} (${roundILS(spike.today)} ש"ח היום, מעל הממוצע).`,
    });
  }

  return out;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long" });

function qualifies(e: ExpenseEntry): boolean {
  if (e.needsConfirmation) return false;
  if (e.bankPending) return false;
  if (e.excludeFromBudget) return false;
  if (e.currency && e.currency !== "ILS") return false;
  return true;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function roundILS(n: number): number {
  return Math.round(n);
}
