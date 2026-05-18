// Bind the caller's iPhone Shortcut device-id to their newly-signed-in
// user account so webhooks routed by `x-sally-device` write under the
// user namespace instead of the legacy device namespace.
//
// Idempotent. Must be called by an authenticated client AFTER sign-in.
//
// Migration policy when both a device-scope blob AND a user-scope blob
// exist for the same person:
//
//   userBlob is null     → copy deviceBlob over (first-ever sign-in path)
//   deviceBlob is null   → leave userBlob alone (signed in elsewhere first)
//   BOTH present         → keep the blob with the larger `updatedAt`.
//                          if updatedAt is the same, keep the richer one
//                          (more accounts/entries) so we never silently
//                          delete the user's data.

import { auth } from "@/lib/auth/config";
import {
  claimDeviceForUser,
  getDeviceClaimUserId,
  releaseDeviceClaim,
} from "@/lib/scope-resolver";
import {
  getUserState,
  isKvConfigured,
  kv,
  migrateTransactions,
  saveUserState,
} from "@/lib/kv";
import { planMigration, richnessScore } from "@/lib/state-merge";

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

  // 0. Refuse to steal a device that's already claimed by someone else.
  //    Unclaimed devices fall through to the claim step below.
  const existingClaim = await getDeviceClaimUserId(deviceId);
  if (existingClaim && existingClaim !== userId) {
    return fail(403, "device_claimed_by_other_user");
  }

  // 1. Record the claim — webhook lookups now route to this user.
  await claimDeviceForUser(deviceId, userId);

  // 2. Remember the device id against the user so the createUser event
  //    handler can migrate the state on the next sign-in if it hadn't
  //    fired yet. Idempotent — overwrites any prior value.
  await kv().set(`sally:auth:user-device:${userId}`, deviceId);

  // 3. Merge state blobs safely.
  const [userBlob, deviceBlob] = await Promise.all([
    getUserState({ kind: "user", id: userId }),
    getUserState({ kind: "device", id: deviceId }),
  ]);

  const plan = planMigration({
    userBlob,
    deviceBlob,
    now: Date.now(),
  });
  if (plan.blob) {
    await saveUserState({ kind: "user", id: userId }, plan.blob);
  }

  // 4. Migrate the transaction queue too. Without this, any wallet/SMS
  //    rows that landed under the device prefix between sign-out and
  //    sign-in would stay invisible to the signed-in dashboard, which
  //    reads from the user prefix.
  const txMigration = await migrateTransactions(
    { kind: "device", id: deviceId },
    { kind: "user", id: userId },
  );

  return Response.json({
    ok: true,
    migrated: plan.outcome,
    txMoved: txMigration.moved,
    userRichness: userBlob ? richnessScore(userBlob) : 0,
    deviceRichness: deviceBlob ? richnessScore(deviceBlob) : 0,
  });
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
