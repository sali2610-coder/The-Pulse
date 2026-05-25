// Phase 217 — daily cron that fires the proactive liquidity push
// even when the user hasn't opened the PWA that day.
//
// Reads the most recent snapshot posted via /api/push/liquidity-status
// for every scope that has a saved Web Push subscription. Fires
// sendAlertPush per scope when willCrossZero is still true AND the
// snapshot is fresh (≤ 26h, enforced by KV TTL).
//
// Auth: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` on
// every cron invocation. We compare in constant time.

import {
  getLiquidityStatus,
  getPushSubscription,
  isKvConfigured,
  kv,
  listPushSubscriptionKeys,
  recordPushAttempt,
  scopeFromPushSubKey,
} from "@/lib/kv";
import { isPushConfigured, sendAlertPush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cap at 60 seconds — Vercel hobby caps default function runtime
// at 10s, pro at 60s. The cron should fan out within that window
// for any realistic single-tenant subscriber count.
export const maxDuration = 60;

const DEDUP_TTL_SECONDS = 23 * 60 * 60;

function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "cron_secret_missing" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!constantTimeEqual(auth, expected)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  if (!isKvConfigured()) {
    return Response.json(
      { ok: false, error: "kv_not_configured" },
      { status: 503 },
    );
  }
  if (!isPushConfigured()) {
    return Response.json(
      { ok: false, error: "vapid_not_configured" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const day = todayKey();

  let processed = 0;
  let pushedOk = 0;
  let pushedFail = 0;
  let skippedNoStatus = 0;
  let skippedNoDip = 0;
  let skippedDeduped = 0;
  let skippedStale = 0;
  let pruned = 0;

  const subKeys = await listPushSubscriptionKeys();
  for (const key of subKeys) {
    processed++;
    const scope = scopeFromPushSubKey(key);
    if (!scope) continue;

    const status = await getLiquidityStatus(scope);
    if (!status) {
      skippedNoStatus++;
      continue;
    }
    if (!status.willCrossZero) {
      skippedNoDip++;
      continue;
    }
    // Snapshot must be fresh — TTL already prunes after 26h but
    // double-check so a stale read doesn't push.
    if (Date.now() - status.updatedAt > 26 * 60 * 60 * 1000) {
      skippedStale++;
      continue;
    }

    // Daily dedup per scope — shares the dedup key with the
    // client-side hook from Phase 212 so only one push lands per day
    // whichever side fires first.
    const dedupKey = `${key.replace(/:push$/, "")}:push:liquidity:${day}`;
    const existing = await kv().get(dedupKey);
    if (existing) {
      skippedDeduped++;
      continue;
    }

    const sub = await getPushSubscription(scope);
    if (!sub) {
      pruned++;
      continue;
    }

    const days = status.daysUntilDip;
    const title =
      days === 0
        ? "תזרים שלילי צפוי כבר היום"
        : `תזרים שלילי צפוי בעוד ${days} ימים`;
    const body = `נקודה נמוכה צפויה: ₪${Math.round(status.lowestProjectedBalance).toLocaleString("he-IL")}. כדאי להקפיא חיוב גדול או לבדוק את החשבון.`;

    const result = await sendAlertPush(sub, {
      kind: "alert",
      id: `liquidity:${day}`,
      severity: "warning",
      title,
      body,
      href: "/",
    });

    await recordPushAttempt(scope, {
      ts: Date.now(),
      ok: result.ok,
      gone: result.gone,
      status: result.status,
      reason: result.reason,
      endpointHost: result.endpointHost,
      externalId: `liquidity-cron:${day}`,
    });

    await kv().set(dedupKey, 1);
    await kv().expire(dedupKey, DEDUP_TTL_SECONDS);

    if (result.ok) pushedOk++;
    else pushedFail++;
  }

  return Response.json({
    ok: true,
    day,
    durationMs: Date.now() - startedAt,
    processed,
    pushedOk,
    pushedFail,
    skippedNoStatus,
    skippedNoDip,
    skippedDeduped,
    skippedStale,
    pruned,
  });
}
