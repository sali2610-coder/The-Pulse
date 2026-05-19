// Enumerates device-scoped state blobs the signed-in user could legally
// adopt — every blob whose deviceId is either unclaimed, or already
// claimed for THIS user. Lets the recovery UI surface backups the user
// lost when their deviceId changed (PWA reinstall, /reset, browser data
// clear), without leaking other users' data.

import { auth } from "@/lib/auth/config";
import {
  deviceIdFromStateKey,
  getUserState,
  isKvConfigured,
  kv,
  listDeviceStateKeys,
  pullTransactionsSince,
} from "@/lib/kv";
import { getDeviceClaimUserId } from "@/lib/scope-resolver";
import { richnessScore } from "@/lib/state-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  const keys = await listDeviceStateKeys();

  /** Tiny cache so we don't re-check the same orphan userId twice. */
  const userExistsCache = new Map<string, boolean>();
  async function userExists(uid: string): Promise<boolean> {
    if (userExistsCache.has(uid)) return userExistsCache.get(uid)!;
    const v = await kv().get(`sally:auth:user:${uid}`);
    const exists = v !== null && v !== undefined;
    userExistsCache.set(uid, exists);
    return exists;
  }

  const candidates: Array<{
    deviceId: string;
    richness: number;
    updatedAt: number;
    txCount: number;
    claimedByMe: boolean;
    /** Claim points to a userId whose user record is gone (former
     *  session that expired or was deleted). Safe to take over because
     *  no live user owns it. */
    claimedByOrphan: boolean;
    /** Original claim userId — useful for debugging in the UI. */
    claimedUserId?: string;
  }> = [];

  for (const key of keys) {
    const deviceId = deviceIdFromStateKey(key);
    if (!deviceId) continue;

    const claim = await getDeviceClaimUserId(deviceId);
    let claimedByMe = false;
    let claimedByOrphan = false;
    if (claim) {
      if (claim === userId) {
        claimedByMe = true;
      } else {
        // Claim points elsewhere. If that user record no longer exists,
        // surface as orphan — the caller can take it over.
        const stillThere = await userExists(claim);
        if (stillThere) continue; // genuinely belongs to another user
        claimedByOrphan = true;
      }
    }

    const blob = await getUserState({ kind: "device", id: deviceId });
    if (!blob) continue;

    const richness = richnessScore(blob);
    const txCount = (
      await pullTransactionsSince(
        { kind: "device", id: deviceId },
        0,
      ).catch(() => [])
    ).length;

    if (richness === 0 && txCount === 0) continue;

    candidates.push({
      deviceId,
      richness,
      updatedAt: blob.updatedAt,
      txCount,
      claimedByMe,
      claimedByOrphan,
      claimedUserId: claim ?? undefined,
    });
  }

  candidates.sort((a, b) => {
    // Richer first; tie-break by newer updatedAt.
    if (b.richness !== a.richness) return b.richness - a.richness;
    return b.updatedAt - a.updatedAt;
  });

  return Response.json({ ok: true, candidates });
}
