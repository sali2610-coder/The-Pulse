// Phase 217 — client posts a once-per-day liquidity snapshot so the
// cron can decide whether to fire a proactive push the next morning
// without re-deriving the user's full state on the server.

import { z } from "zod";

import {
  isKvConfigured,
  saveLiquidityStatus,
} from "@/lib/kv";
import { resolveRequestScope } from "@/lib/scope-resolver";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  willCrossZero: z.boolean(),
  lowestProjectedBalance: z.number(),
  daysUntilDip: z.number().int().min(0).max(120),
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
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(422, "schema_violation");

  await saveLiquidityStatus(scopeRes.scope, {
    ...parsed.data,
    updatedAt: Date.now(),
  });
  return Response.json({ ok: true });
}
