// Resolve the request's Scope.
//
// Lookup order:
//   1. Active NextAuth session (cookie-backed) → user scope.
//   2. `x-sally-device` header → check device-claim KV for a userId
//      that owns this device → user scope.
//   3. `x-sally-device` header alone → legacy single-user device scope.
//   4. None of the above → 400 invalid_device.
//
// The device-claim layer is what lets the iPhone Shortcut keep working
// after the user signs in: the Shortcut never has to learn the userId,
// but webhooks still write under the user's KV namespace once they've
// claimed their device id at sign-in time.

import { auth } from "@/lib/auth/config";
import type { Scope } from "@/lib/scope";
import { kv, isKvConfigured } from "@/lib/kv";

const MAX_DEVICE_ID_LEN = 128;
const DEVICE_ID_RE = /^[A-Za-z0-9_\-:.]+$/;

export type ScopeError = { ok: false; status: number; code: string };
export type ScopeOk = { ok: true; scope: Scope };

const DEVICE_CLAIM_KEY = (deviceId: string) =>
  `sally:auth:device-claim:${deviceId}`;

/** True if the device id is currently claimed by some user. Used by the
 *  webhook resolver. Cheap KV GET — no full user record needed. */
export async function getDeviceClaimUserId(
  deviceId: string,
): Promise<string | null> {
  if (!isKvConfigured()) return null;
  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return null;
  const v = await kv().get(DEVICE_CLAIM_KEY(deviceId));
  return typeof v === "string" ? v : null;
}

/** Mark `deviceId` as owned by `userId`. Idempotent. Used during the
 *  first-time claim flow after a user signs in. */
export async function claimDeviceForUser(
  deviceId: string,
  userId: string,
): Promise<void> {
  if (!isKvConfigured()) return;
  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return;
  // No TTL — the claim survives until the user explicitly revokes it.
  await kv().set(DEVICE_CLAIM_KEY(deviceId), userId);
}

/** Drop the claim (e.g. user signs out and unlinks the iPhone). */
export async function releaseDeviceClaim(deviceId: string): Promise<void> {
  if (!isKvConfigured()) return;
  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return;
  await kv().del(DEVICE_CLAIM_KEY(deviceId));
}

export async function resolveRequestScope(
  req: Request,
): Promise<ScopeOk | ScopeError> {
  // 1. NextAuth session takes precedence.
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (typeof userId === "string" && userId.length > 0) {
      return { ok: true, scope: { kind: "user", id: userId } };
    }
  } catch {
    // auth() can throw inside non-Node runtimes when config is missing;
    // fall through to device-id mode.
  }

  // 2. Bare device id.
  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !DEVICE_ID_RE.test(deviceId)
  ) {
    return { ok: false, status: 400, code: "invalid_device" };
  }

  // 3. Device-id with claim → route the write under the owning user.
  const claimedUserId = await getDeviceClaimUserId(deviceId);
  if (claimedUserId) {
    return { ok: true, scope: { kind: "user", id: claimedUserId } };
  }

  // 4. Legacy single-user device scope.
  return { ok: true, scope: { kind: "device", id: deviceId } };
}
