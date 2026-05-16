import { findTransactionByExternalId, isKvConfigured } from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ externalId: string }> },
): Promise<Response> {
  const { externalId } = await params;
  if (!externalId || externalId.length > 256) {
    return fail(400, "invalid_external_id");
  }

  const scopeRes = await resolveRequestScope(req);
  if (!scopeRes.ok) return fail(scopeRes.status, scopeRes.code);

  if (!isKvConfigured()) {
    return Response.json({ ok: true, configured: false, transaction: null });
  }

  const tx = await findTransactionByExternalId(scopeRes.scope, externalId);
  return Response.json({
    ok: true,
    configured: true,
    transaction: tx,
  });
}
