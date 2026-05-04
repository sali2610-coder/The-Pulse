import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/categories";
import { isKvConfigured, recordCategoryOverride } from "@/lib/kv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const schema = z.object({
  externalId: z.string().min(1).max(128),
  category: z.enum(CATEGORY_IDS),
});

const MAX_DEVICE_ID_LEN = 128;

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !/^[A-Za-z0-9_\-:.]+$/.test(deviceId)
  ) {
    return fail(400, "invalid_device");
  }
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
    deviceId,
    parsed.data.externalId,
    parsed.data.category,
  );
  return Response.json({ ok: true });
}
