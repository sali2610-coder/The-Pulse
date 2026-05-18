import {
  deletePushSubscription,
  getPushSubscription,
  pushTransaction,
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

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

/**
 * Test push exercises the full Tap-to-Pulse pipeline end-to-end:
 *
 *   1. Persist a real pending transaction in KV under the caller's scope.
 *      It's marked `needsConfirmation: true` so the dashboard's
 *      PendingTray shows it and the engine excludes it from forecasts
 *      until the user confirms.
 *
 *   2. Send the categorize push with that same `externalId`.
 *      Tapping the notification deep-links into
 *      `/confirm/<externalId>`, which loads the row via
 *      `/api/transactions/pending/<externalId>` and opens the
 *      ConfirmationSheet — the SAME flow real Wallet/SMS charges use.
 *
 *   3. Merchant is prefixed with `🧪` so the user can tell test rows
 *      apart from real ones; the discard action in the sheet removes
 *      them like any other entry.
 */
export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isPushConfigured()) return fail(503, "push_not_configured");

  const sub = await getPushSubscription(scopeRes.scope);
  if (!sub) return fail(404, "no_subscription");

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

  // Best-effort persist. If KV is down we still fire the push so the
  // user sees the notification chain works.
  await pushTransaction(scopeRes.scope, stored).catch(() => undefined);

  const result = await sendCategorizePush(sub, {
    kind: "categorize",
    externalId,
    deviceId: scopeRes.scope.id,
    amount,
    merchant,
    categoryHint: "other",
    occurredAt,
  });

  if (result.gone) {
    await deletePushSubscription(scopeRes.scope);
    return fail(410, "subscription_gone");
  }
  if (!result.ok) return fail(502, "push_failed");

  return Response.json({ ok: true, externalId });
}
