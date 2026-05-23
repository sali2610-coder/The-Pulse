// Visible diagnostic surface for the Tap-to-Pulse pipeline.
//
// Returns the server-side view of the caller's push setup: whether a
// subscription record exists, the endpoint host (so the client can
// compare against its own pushManager.getSubscription()), VAPID config
// flag, and the last send attempt (when, status, reason).
//
// Read-only. Auth gate via resolveRequestScope. No subscription content
// or auth secrets are echoed back.

import {
  getPushSubscription,
  isKvConfigured,
  listNativePushTokens,
  readPushAttempt,
} from "@/lib/kv";
import { isPushConfigured } from "@/lib/push-server";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function endpointHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
}

export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) {
    return Response.json(
      { ok: false, error: scopeRes.code },
      { status: scopeRes.status },
    );
  }

  const vapidConfigured = isPushConfigured();
  const kvConfigured = isKvConfigured();

  const sub = kvConfigured ? await getPushSubscription(scopeRes.scope) : null;
  const lastAttempt = kvConfigured
    ? await readPushAttempt(scopeRes.scope)
    : null;
  const nativeTokens = kvConfigured
    ? await listNativePushTokens(scopeRes.scope)
    : [];

  return Response.json({
    ok: true,
    scopeKind: scopeRes.scope.kind,
    vapidConfigured,
    kvConfigured,
    apnsConfigured: Boolean(
      process.env.APNS_TEAM_ID &&
        process.env.APNS_KEY_ID &&
        process.env.APNS_PRIVATE_KEY &&
        process.env.APNS_BUNDLE_ID,
    ),
    fcmConfigured: Boolean(
      process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON,
    ),
    subscription: sub
      ? {
          endpoint: sub.endpoint,
          endpointHost: endpointHost(sub.endpoint),
          registeredAt: sub.registeredAt,
        }
      : null,
    nativeTokens: nativeTokens.map((t) => ({
      platform: t.platform,
      tokenPreview:
        t.token.length <= 12
          ? "*".repeat(t.token.length)
          : `${t.token.slice(0, 8)}…${t.token.slice(-4)}`,
      deviceId: t.deviceId,
      userId: t.userId,
      appVersion: t.appVersion,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    lastAttempt,
  });
}
