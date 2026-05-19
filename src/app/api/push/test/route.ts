import {
  deletePushSubscription,
  getPushSubscription,
  pushTransaction,
  recordPushAttempt,
  removeTransaction,
  type StoredTransaction,
} from "@/lib/kv";
import {
  isPushConfigured,
  sendCategorizePush,
} from "@/lib/push-server";
import { resolveRequestScope } from "@/lib/scope-resolver";

// Node runtime — `web-push` depends on `node:crypto`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stable externalId for the synthetic test transaction. Reused across
 * every "שלח התראת בדיקה" click so we don't accumulate one duplicate
 * pending row per click.
 */
const TEST_EXTERNAL_ID = "sally-test-push";

function fail(status: number, code: string, extra?: Record<string, unknown>) {
  return Response.json(
    { ok: false, error: code, ...(extra ?? {}) },
    { status },
  );
}

export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isPushConfigured()) return fail(503, "push_not_configured");

  // Real browser-side device id — needed in the push payload so the
  // SW's click-beacon writes under the SAME deviceId the PWA reads
  // back on mount. Falls back to scope.id only when the header is
  // missing (e.g. signed-in flows that hit /api/push/test from a
  // non-iPhone context).
  const headerDeviceId = req.headers.get("x-sally-device") ?? "";
  const beaconDeviceId =
    headerDeviceId && /^[A-Za-z0-9_\-:.]+$/.test(headerDeviceId)
      ? headerDeviceId
      : scopeRes.scope.id;

  const sub = await getPushSubscription(scopeRes.scope);
  if (!sub) {
    console.warn("[push-test] no subscription for scope", scopeRes.scope);
    return fail(404, "no_subscription");
  }

  // Drop any prior test row so we don't keep stacking duplicates in
  // either the tx ZSET or the webhook log diagnostics.
  await removeTransaction(scopeRes.scope, TEST_EXTERNAL_ID).catch(() => undefined);

  const now = Date.now();
  const occurredAt = new Date(now).toISOString();
  const merchant = "🧪 בדיקה";
  const amount = 1.0;

  const stored: StoredTransaction = {
    externalId: TEST_EXTERNAL_ID,
    amount,
    category: "other",
    paymentMethod: "credit",
    installments: 1,
    issuer: "wallet",
    source: "wallet",
    merchant,
    note: "התראת בדיקה — לחיצה תפתח את מסך האישור",
    occurredAt,
    receivedAt: now,
    needsConfirmation: true,
    rawNotificationBody: `Test ₪${amount} ${merchant}`,
  };

  console.info(
    `[push-test] scope=${scopeRes.scope.kind}:${scopeRes.scope.id.slice(0, 8)}… endpoint=${sub.endpoint.slice(0, 80)}…`,
  );

  await pushTransaction(scopeRes.scope, stored).catch((err) => {
    console.error("[push-test] pushTransaction failed", err);
  });

  const result = await sendCategorizePush(sub, {
    kind: "categorize",
    externalId: TEST_EXTERNAL_ID,
    deviceId: beaconDeviceId,
    amount,
    merchant,
    // No categoryHint — keeps SW from rendering quick-confirm actions
    // that would short-circuit the body tap on small notification UIs.
    occurredAt,
  });

  await recordPushAttempt(scopeRes.scope, {
    ts: Date.now(),
    ok: result.ok,
    gone: result.gone,
    status: result.status,
    reason: result.reason,
    endpointHost: result.endpointHost,
    externalId: TEST_EXTERNAL_ID,
  }).catch(() => undefined);

  if (result.gone) {
    await deletePushSubscription(scopeRes.scope);
    return fail(410, "subscription_gone", {
      pushStatus: result.status,
      endpointHost: result.endpointHost,
    });
  }
  if (!result.ok) {
    return fail(502, result.reason ?? "push_failed", {
      pushStatus: result.status,
      endpointHost: result.endpointHost,
    });
  }

  return Response.json({
    ok: true,
    externalId: TEST_EXTERNAL_ID,
    pushStatus: result.status,
    endpointHost: result.endpointHost,
  });
}
