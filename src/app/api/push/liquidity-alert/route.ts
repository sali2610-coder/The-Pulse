// Phase 212 — proactive liquidity push alert.
//
// Caller (the dashboard) POSTs when the local liquidity engine
// flags `willCrossZero`. Server dedupes per scope per day with a
// 23-hour TTL (so the user gets at most one push per day per dip
// signal), looks up the active Web Push subscription, and fires
// an alert payload through the existing sendAlertPush pipeline.
//
// Node runtime — web-push needs `crypto`/`buffer` from Node, and
// the existing /api/push/test route uses the same runtime.

import { z } from "zod";

import { isPushConfigured, sendAlertPush } from "@/lib/push-server";
import {
  getPushSubscription,
  isKvConfigured,
  kv,
  recordPushAttempt,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  daysUntilDip: z.number().int().min(0).max(45),
  lowestAt: z.string().datetime().optional(),
  lowestBalance: z.number().optional(),
});

const DEDUP_TTL_SECONDS = 23 * 60 * 60;
const DEDUP_KEY = (scopePrefix: string, dayKey: string) =>
  `${scopePrefix}:push:liquidity:${dayKey}`;

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");
  if (!isPushConfigured()) return fail(503, "vapid_not_configured");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(422, "schema_violation");

  // Dedupe per scope per day.
  const scopePrefix =
    scopeRes.scope.kind === "user"
      ? `sally:user:${scopeRes.scope.id}`
      : `sally:device:${scopeRes.scope.id}`;
  const key = DEDUP_KEY(scopePrefix, todayKey());
  const existing = await kv().get(key);
  if (existing) {
    return Response.json({ ok: true, deduped: true });
  }

  const sub = await getPushSubscription(scopeRes.scope);
  if (!sub) {
    // Mark the day anyway so a missing subscription doesn't make
    // the client retry every render.
    await kv().set(key, 1);
    await kv().expire(key, DEDUP_TTL_SECONDS);
    return Response.json({ ok: false, error: "no_subscription" });
  }

  const days = parsed.data.daysUntilDip;
  const title =
    days === 0
      ? "תזרים שלילי צפוי כבר היום"
      : `תזרים שלילי צפוי בעוד ${days} ימים`;
  const body =
    parsed.data.lowestBalance !== undefined
      ? `נקודה נמוכה צפויה: ₪${Math.round(parsed.data.lowestBalance).toLocaleString("he-IL")}. כדאי להקפיא חיובים גדולים או לבדוק את החשבון.`
      : "Pulse זיהה ירידה צפויה ביתרת הבנק לפני המשכורת הבאה.";

  const result = await sendAlertPush(sub, {
    kind: "alert",
    id: `liquidity:${todayKey()}`,
    severity: "warning",
    title,
    body,
    href: "/",
  });

  await recordPushAttempt(scopeRes.scope, {
    ts: Date.now(),
    ok: result.ok,
    gone: result.gone,
    status: result.status,
    reason: result.reason,
    endpointHost: result.endpointHost,
    externalId: `liquidity:${todayKey()}`,
  });

  // Always mark the day to prevent retry storms — even if the push
  // failed, we'll try again tomorrow naturally.
  await kv().set(key, 1);
  await kv().expire(key, DEDUP_TTL_SECONDS);

  return Response.json({
    ok: result.ok,
    deduped: false,
    pushStatus: result.status,
    endpointHost: result.endpointHost,
    reason: result.reason,
  });
}
