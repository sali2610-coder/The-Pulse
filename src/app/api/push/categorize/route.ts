import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/categories";
import { isKvConfigured, recordCategoryOverride } from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const schema = z.object({
  externalId: z.string().min(1).max(128),
  category: z.enum(CATEGORY_IDS),
});

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
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
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(422, "schema_violation");

  await recordCategoryOverride(
    scopeRes.scope,
    parsed.data.externalId,
    parsed.data.category,
  );
  return Response.json({ ok: true });
}
