// Manual recovery — pull the device-scoped state blob back into the
// signed-in user's namespace. Defensive: useful if the initial
// device→user migration looked wrong (network blip, partial pull),
// or if the user wants to overlay an older device snapshot.
//
// Auth gated. Operates only on the device id the caller specifies AND
// claims to own (or a previously-claimed device for this user).
//
// Two flows:
//   GET  → report what's available (userBlob + deviceBlob richness +
//          updatedAt) so a UI can show "device backup found, X entries,
//          updated Y"
//   POST → actually overlay. Accepts { deviceId, strategy } where
//          strategy is "newest" (default — same logic as claim-device) or
//          "force-device" (overwrite user with device, irreversible until
//          the next PUT). Returns the same shape as claim-device.

import { auth } from "@/lib/auth/config";
import {
  getUserState,
  isKvConfigured,
  kv,
  migrateTransactions,
  pullTransactionsSince,
  saveUserState,
  type StateBlob,
} from "@/lib/kv";
import {
  claimDeviceForUser,
  getDeviceClaimUserId,
} from "@/lib/scope-resolver";
import { planMigration, richnessScore } from "@/lib/state-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

/** True when the userId actually exists as a NextAuth user record. Used
 *  to detect orphan claims (former sessions that were deleted/expired
 *  while the device-claim KV row persisted). Orphan claims can be
 *  safely taken over because no live user owns them. */
async function userRecordExists(uid: string): Promise<boolean> {
  const v = await kv().get(`sally:auth:user:${uid}`);
  return v !== null && v !== undefined;
}

/** Authorisation rule:
 *    claim is null            → allowed (unclaimed device)
 *    claim === current user   → allowed (idempotent)
 *    claim is some other id but THAT user record no longer exists
 *                             → allowed (orphan — former session of this
 *                               same human, or expired)
 *    claim is another live user → 403
 */
async function assertOwnsDevice(
  deviceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string }> {
  const claimed = await getDeviceClaimUserId(deviceId);
  if (!claimed || claimed === userId) return { ok: true };
  const stillThere = await userRecordExists(claimed);
  if (!stillThere) return { ok: true };
  return { ok: false, status: 403, code: "device_claimed_by_other_user" };
}

async function loadBlobs(userId: string, deviceId: string) {
  const [userBlob, deviceBlob] = await Promise.all([
    getUserState({ kind: "user", id: userId }),
    getUserState({ kind: "device", id: deviceId }),
  ]);
  return { userBlob, deviceBlob };
}

function summarize(b: StateBlob | null) {
  if (!b) return null;
  return {
    updatedAt: b.updatedAt,
    richness: richnessScore(b),
  };
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  if (!deviceId) return fail(400, "missing_device_id");

  const guard = await assertOwnsDevice(deviceId, userId);
  if (!guard.ok) return fail(guard.status, guard.code);

  const { userBlob, deviceBlob } = await loadBlobs(userId, deviceId);
  // Also report whether the device's transaction queue still holds rows
  // — drives the recovery UI's "pending transactions found" hint even
  // when the device state blob itself is empty.
  const deviceTxCount = (
    await pullTransactionsSince(
      { kind: "device", id: deviceId },
      0,
    ).catch(() => [])
  ).length;
  return Response.json({
    ok: true,
    user: summarize(userBlob),
    device: summarize(deviceBlob),
    deviceTxCount,
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: {
    deviceId?: string;
    strategy?: "newest" | "force-device" | "takeover";
  } | null;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const deviceId = body?.deviceId;
  if (typeof deviceId !== "string" || !deviceId) {
    return fail(400, "missing_device_id");
  }
  const strategy = body?.strategy ?? "newest";

  const guard = await assertOwnsDevice(deviceId, userId);
  if (!guard.ok) return fail(guard.status, guard.code);

  // "takeover" rebinds the device claim onto the current user — used when
  // restoring an orphan blob whose claim points at a deleted user record
  // (former session of the same human). assertOwnsDevice has already
  // verified the orphan condition.
  if (strategy === "takeover") {
    await claimDeviceForUser(deviceId, userId);
    await kv().set(`sally:auth:user-device:${userId}`, deviceId);
  }

  const { userBlob, deviceBlob } = await loadBlobs(userId, deviceId);
  if (!deviceBlob) {
    return Response.json({
      ok: false,
      error: "no_device_blob",
      user: summarize(userBlob),
    });
  }

  // Tx migration runs regardless of strategy — it's dedup-safe (SET-NX
  // gate on externalId) and orphan rows in the device queue are always
  // safe to fold into the user queue.
  const txMigration = await migrateTransactions(
    { kind: "device", id: deviceId },
    { kind: "user", id: userId },
  );

  if (strategy === "force-device" || strategy === "takeover") {
    const next: StateBlob = {
      version: deviceBlob.version,
      updatedAt: Date.now(),
      state: deviceBlob.state,
    };
    await saveUserState({ kind: "user", id: userId }, next);
    return Response.json({
      ok: true,
      migrated: "copied",
      txMoved: txMigration.moved,
      user: summarize(userBlob),
      device: summarize(deviceBlob),
    });
  }

  const plan = planMigration({
    userBlob,
    deviceBlob,
    now: Date.now(),
  });
  if (plan.blob) {
    await saveUserState({ kind: "user", id: userId }, plan.blob);
  }
  return Response.json({
    ok: true,
    migrated: plan.outcome,
    txMoved: txMigration.moved,
    user: summarize(userBlob),
    device: summarize(deviceBlob),
  });
}
