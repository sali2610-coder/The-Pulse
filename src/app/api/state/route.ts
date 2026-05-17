// Per-scope state route. Stores the full Zustand store blob in KV so the
// user's financial setup follows them across browsers, devices, PWA
// reinstalls, and Vercel deploys.
//
// Auth: delegates to resolveRequestScope which picks the strongest signal
// available — NextAuth session → device-claim → bare device id.
// No Bearer required.

import {
  getUserState,
  isKvConfigured,
  saveUserState,
  type StateBlob,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

const MAX_BLOB_BYTES = 512 * 1024; // 512 KB — plenty for hundreds of entries.

export async function GET(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) {
    return Response.json({ ok: true, configured: false, blob: null });
  }
  const blob = await getUserState(scopeRes.scope);
  return Response.json({ ok: true, configured: true, blob });
}

export async function PUT(req: Request): Promise<Response> {
  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  // Body size check — Edge runtime caps payloads, but we add our own gate
  // for defence-in-depth.
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const size = Number(contentLengthHeader);
    if (Number.isFinite(size) && size > MAX_BLOB_BYTES) {
      return fail(413, "blob_too_large");
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  if (!body || typeof body !== "object") return fail(400, "schema_violation");
  const candidate = body as Partial<StateBlob>;
  if (typeof candidate.version !== "number") return fail(400, "missing_version");
  if (candidate.state === undefined) return fail(400, "missing_state");

  const blob: StateBlob = {
    version: candidate.version,
    updatedAt: Date.now(),
    state: candidate.state,
  };
  await saveUserState(scopeRes.scope, blob);
  return Response.json({ ok: true, updatedAt: blob.updatedAt });
}
