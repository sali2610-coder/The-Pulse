// Push-click beacon — device-scoped only.
//
// CRITICAL: this route does NOT use resolveRequestScope. The Service
// Worker's POST happens from background context where iOS Safari
// doesn't reliably forward the Supabase session cookie. The PWA's GET
// happens from a normal client where the cookie IS forwarded. If both
// went through resolveRequestScope, the SW would write under a device
// scope while the PWA would read under a user scope, and the beacon
// would be invisible.
//
// Symmetric solution: both endpoints key on the `x-sally-device`
// header directly, so SW writes and PWA reads land on the SAME KV
// row regardless of session state. The scope-resolver's user/device
// distinction matters for state + transactions; for a transient
// 5-minute click marker, deviceId is enough.

import { kv, isKvConfigured } from "@/lib/kv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DEVICE_RE = /^[A-Za-z0-9_\-:.]+$/;
const MAX_DEVICE_LEN = 128;

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

function clickKey(deviceId: string): string {
  return `sally:device:${deviceId}:push:click`;
}

function deviceIdFromReq(req: Request): string | null {
  const raw = req.headers.get("x-sally-device") ?? "";
  if (!raw || raw.length > MAX_DEVICE_LEN || !DEVICE_RE.test(raw)) {
    return null;
  }
  return raw;
}

export async function POST(req: Request): Promise<Response> {
  const deviceId = deviceIdFromReq(req);
  if (!deviceId) return fail(400, "invalid_device");
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

  const payload = JSON.stringify({ externalId, ts: Date.now() });
  await kv().set(clickKey(deviceId), payload, { ex: 300 });
  return Response.json({ ok: true });
}

export async function GET(req: Request): Promise<Response> {
  const deviceId = deviceIdFromReq(req);
  if (!deviceId) return fail(400, "invalid_device");
  if (!isKvConfigured()) {
    return Response.json({ ok: true, click: null });
  }
  const raw = await kv().get(clickKey(deviceId));
  if (!raw) return Response.json({ ok: true, click: null });
  await kv().del(clickKey(deviceId));
  let click: { externalId: string; ts: number } | null = null;
  if (typeof raw === "string") {
    try {
      click = JSON.parse(raw);
    } catch {
      click = null;
    }
  } else {
    click = raw as { externalId: string; ts: number };
  }
  return Response.json({ ok: true, click });
}
