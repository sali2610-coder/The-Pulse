// Bind the caller's iPhone Shortcut device-id to their newly-signed-in
// user account so webhooks routed by `x-sally-device` write under the
// user namespace instead of the legacy device namespace.
//
// Idempotent. Must be called by an authenticated client AFTER sign-in.

import { auth } from "@/lib/auth/config";
import {
  claimDeviceForUser,
  releaseDeviceClaim,
} from "@/lib/scope-resolver";
import {
  getUserState,
  isKvConfigured,
  kv,
  saveUserState,
  type StateBlob,
} from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const deviceId = (body as { deviceId?: string } | null)?.deviceId;
  if (typeof deviceId !== "string" || !deviceId) {
    return fail(400, "missing_device_id");
  }

  // 1. Record the claim — webhook lookups now route to this user.
  await claimDeviceForUser(deviceId, userId);

  // 2. Remember the device id against the user so the createUser event
  //    handler can migrate the state on the next sign-in if it hadn't
  //    fired yet. Idempotent — overwrites any prior value.
  await kv().set(`sally:auth:user-device:${userId}`, deviceId);

  // 3. Migrate the device-scoped state blob if the user hasn't already
  //    got one.
  const userBlob = await getUserState({ kind: "user", id: userId });
  if (!userBlob) {
    const deviceBlob = await getUserState({ kind: "device", id: deviceId });
    if (deviceBlob) {
      const migrated: StateBlob = {
        version: deviceBlob.version,
        updatedAt: Date.now(),
        state: deviceBlob.state,
      };
      await saveUserState({ kind: "user", id: userId }, migrated);
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const deviceId = (body as { deviceId?: string } | null)?.deviceId;
  if (typeof deviceId !== "string" || !deviceId) {
    return fail(400, "missing_device_id");
  }
  await releaseDeviceClaim(deviceId);
  return Response.json({ ok: true });
}
