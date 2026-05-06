import {
  isKvConfigured,
  readUserWebhookLog,
  readAnonWebhookLog,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

// Diagnostics endpoint deliberately lives outside /api/webhooks/* (which is
// public) so the standard Clerk middleware enforces auth here. The route
// returns the most recent webhook attempts attributed to the caller plus a
// short anon ring buffer for unauth'd attempts (so first-time setup users
// can see "an unauth attempt happened ~5s ago — probably your Shortcut").
export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) {
    return Response.json({ ok: true, mine: [], anon: [], configured: false });
  }
  const [mine, anon] = await Promise.all([
    readUserWebhookLog(scopeRes.scope),
    readAnonWebhookLog(),
  ]);
  return Response.json({ ok: true, mine, anon, configured: true });
}
