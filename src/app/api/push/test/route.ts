import {
  deletePushSubscription,
  getPushSubscription,
  pushTransaction,
  recordPushAttempt,
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

function fail(status: number, code: string, extra?: Record<string, unknown>) {
  return Response.json(
    { ok: false, error: code, ...(extra ?? {}) },
    { status },
  );
}

/**
 * Test push exercises the full Tap-to-Pulse pipeline end-to-end:
 *
 *   1. Persist a real pending transaction in KV under the caller's scope.
 *   2. Send the categorize push with that same `externalId`. Tapping the
 *      notification deep-links to /confirm/<externalId>, which loads the
 *      row via /api/transactions/pending/<id> and opens ConfirmationSheet.
 *   3. Echo back the full push-service response shape so the caller can
 *      surface diagnostic info (endpoint host, push-service status,
 *      reason tag) when the notification doesn't appear on the device.
 */
export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isPushConfigured()) return fail(503, "push_not_configured");

  const sub = await getPushSubscription(scopeRes.scope);
  if (!sub) {
    console.warn("[push-test] no subscription for scope", scopeRes.scope);
    return fail(404, "no_subscription");
  }

  console.info(
    `[push-test] scope=${scopeRes.scope.kind}:${scopeRes.scope.id.slice(0, 8)}… endpoint=${sub.endpoint.slice(0, 80)}…`,
  );

  const now = Date.now();
  const externalId = `test-${now.toString(36)}`;
  const occurredAt = new Date(now).toISOString();
  const merchant = "🧪 בדיקה";
  const amount = 1.0;

  const stored: StoredTransaction = {
    externalId,
    amount,
    category: "other",
    paymentMethod: "credit",
    installments: 1,
    issuer: "wallet",
    source: "wallet",
    merchant,
    note: "התראת בדיקה — נוצרה מהגדרות Sally",
    occurredAt,
    receivedAt: now,
    needsConfirmation: true,
    rawNotificationBody: `Test ₪${amount} ${merchant}`,
  };

  await pushTransaction(scopeRes.scope, stored).catch((err) => {
    console.error("[push-test] pushTransaction failed", err);
  });

  const result = await sendCategorizePush(sub, {
    kind: "categorize",
    externalId,
    deviceId: scopeRes.scope.id,
    amount,
    merchant,
    categoryHint: "other",
    occurredAt,
  });

  await recordPushAttempt(scopeRes.scope, {
    ts: Date.now(),
    ok: result.ok,
    gone: result.gone,
    status: result.status,
    reason: result.reason,
    endpointHost: result.endpointHost,
    externalId,
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
    externalId,
    pushStatus: result.status,
    endpointHost: result.endpointHost,
  });
}
