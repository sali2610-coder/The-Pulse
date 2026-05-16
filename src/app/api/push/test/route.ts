import {
  deletePushSubscription,
  getPushSubscription,
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
 * Fire a synthetic categorize push to the user's stored subscription so they
 * can verify the install/VAPID/Service-Worker chain end-to-end without
 * waiting for a real charge to land.
 */
export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isPushConfigured()) return fail(503, "push_not_configured");

  const sub = await getPushSubscription(scopeRes.scope);
  if (!sub) return fail(404, "no_subscription");

  const sample = {
    kind: "categorize" as const,
    externalId: `test:${Date.now()}`,
    deviceId: scopeRes.scope.id,
    amount: 42.9,
    merchant: "שופרסל",
    cardLast4: "1234",
    categoryHint: "food",
    occurredAt: new Date().toISOString(),
  };
  const result = await sendCategorizePush(sub, sample);

  if (result.gone) {
    // Subscription is dead — clean up so next "enable" creates a fresh one.
    await deletePushSubscription(scopeRes.scope);
    return fail(410, "subscription_gone");
  }
  if (!result.ok) return fail(502, "push_failed");

  return Response.json({ ok: true, externalId: sample.externalId });
}
