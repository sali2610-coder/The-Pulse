// Native push token registration.
//
// Companion to /api/push/subscribe (Web Push). One record per
// (scope, platform). Edge runtime so the iOS/Android shell can
// register from any region without cold-start lag.

import {
  deleteNativePushToken,
  getNativePushToken,
  isKvConfigured,
  listNativePushTokens,
  saveNativePushToken,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";
import {
  buildNativePushTokenRecord,
  validateNativePushTokenInput,
} from "@/lib/native/push-token";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string, detail?: string) {
  return Response.json(
    { ok: false, error: code, ...(detail ? { detail } : {}) },
    { status },
  );
}

/** GET — list this scope's currently registered native tokens.
 *  Used by the diagnostic card to surface which platforms have a
 *  live token vs which still rely on Web Push fallback. */
export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) {
    return Response.json({ ok: true, configured: false, tokens: [] });
  }
  const tokens = await listNativePushTokens(scopeRes.scope);
  // Mask raw tokens — diagnostic doesn't need the full secret. Just
  // first 8 chars + last 4 so the user can verify rotation visually.
  return Response.json({
    ok: true,
    configured: true,
    tokens: tokens.map((t) => ({
      platform: t.platform,
      tokenPreview: maskToken(t.token),
      deviceId: t.deviceId,
      userId: t.userId,
      appVersion: t.appVersion,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const validation = validateNativePushTokenInput(raw);
  if (!validation.ok) {
    return fail(422, validation.reason, validation.detail);
  }

  // Preserve createdAt across re-registrations so the audit trail
  // remains accurate even though the token may rotate (APNs/FCM both
  // issue replacement tokens for the same device over time).
  const prior = await getNativePushToken(
    scopeRes.scope,
    validation.value.platform,
  );
  const record = buildNativePushTokenRecord({
    input: validation.value,
    previousCreatedAt: prior?.createdAt,
  });

  await saveNativePushToken(scopeRes.scope, record);
  return Response.json({
    ok: true,
    platform: record.platform,
    rotated: Boolean(prior && prior.token !== record.token),
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  if (platform !== "ios" && platform !== "android") {
    return fail(400, "invalid_platform");
  }
  await deleteNativePushToken(scopeRes.scope, platform);
  return Response.json({ ok: true });
}

function maskToken(t: string): string {
  if (t.length <= 12) return "*".repeat(t.length);
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}
