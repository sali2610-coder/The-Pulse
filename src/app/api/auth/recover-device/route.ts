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
  saveUserState,
  type StateBlob,
} from "@/lib/kv";
import { getDeviceClaimUserId } from "@/lib/scope-resolver";
import { planMigration, richnessScore } from "@/lib/state-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

/** Authorisation rule: the caller may read/restore a device blob only when
 *  the device is either unclaimed (legacy / first-ever sign-in path) OR
 *  already claimed by the caller's own user id. Anything else → 403, so
 *  a signed-in attacker can't trawl other users' device backups by
 *  guessing deviceIds. */
async function assertOwnsDevice(
  deviceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string }> {
  const claimed = await getDeviceClaimUserId(deviceId);
  if (claimed && claimed !== userId) {
    return { ok: false, status: 403, code: "device_claimed_by_other_user" };
  }
  return { ok: true };
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
  return Response.json({
    ok: true,
    user: summarize(userBlob),
    device: summarize(deviceBlob),
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: { deviceId?: string; strategy?: "newest" | "force-device" } | null;
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

  const { userBlob, deviceBlob } = await loadBlobs(userId, deviceId);
  if (!deviceBlob) {
    return Response.json({
      ok: false,
      error: "no_device_blob",
      user: summarize(userBlob),
    });
  }

  if (strategy === "force-device") {
    const next: StateBlob = {
      version: deviceBlob.version,
      updatedAt: Date.now(),
      state: deviceBlob.state,
    };
    await saveUserState({ kind: "user", id: userId }, next);
    return Response.json({
      ok: true,
      migrated: "copied",
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
    user: summarize(userBlob),
    device: summarize(deviceBlob),
  });
}
