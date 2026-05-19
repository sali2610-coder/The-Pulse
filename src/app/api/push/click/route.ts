// Push-click beacon.
//
// Notification tap on iOS standalone PWA frequently fails to deliver
// the postMessage from the SW to the existing client AND
// `clients.openWindow` returns null when the PWA is already running.
// Result: the SW knows the user tapped, but the PWA never navigates.
//
// Workaround: the SW also POSTs here with the externalId. We store
// `<scope>:push:click` with a 5-minute TTL. On every PWA mount /
// visibility change, the PWA GETs this endpoint (which atomically
// consumes the marker) and navigates to /confirm/<externalId> if a
// recent click is found.
//
// Auth gate via resolveRequestScope so a beacon for one user never
// surfaces on another user's session.

import {
  consumePushClick,
  isKvConfigured,
  recordPushClick,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: { externalId?: string } | null;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const externalId = body?.externalId;
  if (typeof externalId !== "string" || !externalId) {
    return fail(400, "missing_external_id");
  }
  await recordPushClick(scopeRes.scope, {
    externalId,
    ts: Date.now(),
  });
  return Response.json({ ok: true });
}

export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) {
    return Response.json({ ok: true, click: null });
  }
  const click = await consumePushClick(scopeRes.scope);
  return Response.json({ ok: true, click });
}
