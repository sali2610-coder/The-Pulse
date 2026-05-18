import { z } from "zod";
import {
  isKvConfigured,
  savePushSubscription,
  deletePushSubscription,
  getPushSubscription,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(10).max(256),
    auth: z.string().min(10).max(256),
  }),
});

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

/** GET — does this scope have a saved push subscription? Used by the
 *  client toggle to reconcile its UI with server state after a PWA
 *  cold-start (iOS sometimes drops the in-browser PushSubscription
 *  while the server still has a valid record). */
export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) {
    return Response.json({ ok: true, configured: false, subscribed: false });
  }
  const sub = await getPushSubscription(scopeRes.scope);
  return Response.json({
    ok: true,
    configured: true,
    subscribed: Boolean(sub),
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
  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) return fail(422, "schema_violation");

  await savePushSubscription(scopeRes.scope, {
    ...parsed.data,
    registeredAt: Date.now(),
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");
  await deletePushSubscription(scopeRes.scope);
  return Response.json({ ok: true });
}
