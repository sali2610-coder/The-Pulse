// Enumerates device-scoped state blobs the signed-in user could legally
// adopt. Phase 152b: identity is Supabase. The orphan-claim takeover
// path that used the NextAuth KV user record is gone — without that
// table we can't reliably tell a deleted user from a live one whose
// session simply expired. We now surface ONLY devices whose claim
// already points at the current user (claimedByMe), keeping
// cross-user isolation absolute.

import {
  deviceIdFromStateKey,
  getUserState,
  isKvConfigured,
  listDeviceStateKeys,
  pullTransactionsSince,
} from "@/lib/kv";
import { getDeviceClaimUserId } from "@/lib/scope-resolver";
import { richnessScore } from "@/lib/state-merge";
import { getServerUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function GET(): Promise<Response> {
  const user = await getServerUser();
  const userId = user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  const keys = await listDeviceStateKeys();

  const candidates: Array<{
    deviceId: string;
    richness: number;
    updatedAt: number;
    txCount: number;
    claimedByMe: boolean;
  }> = [];

  for (const key of keys) {
    const deviceId = deviceIdFromStateKey(key);
    if (!deviceId) continue;

    const claim = await getDeviceClaimUserId(deviceId);
    // Skip every device that ISN'T already claimed by this user.
    // Unclaimed devices are still adoptable through the legacy
    // claim-device endpoint, but the recovery surface filters to
    // owned-only so we can never accidentally hand one user's data
    // to another.
    if (claim !== userId) continue;

    const blob = await getUserState({ kind: "device", id: deviceId });
    if (!blob) continue;

    const richness = richnessScore(blob);
    const txCount = (
      await pullTransactionsSince({ kind: "device", id: deviceId }, 0).catch(
        () => [],
      )
    ).length;

    if (richness === 0 && txCount === 0) continue;

    candidates.push({
      deviceId,
      richness,
      updatedAt: blob.updatedAt,
      txCount,
      claimedByMe: true,
    });
  }

  candidates.sort((a, b) => {
    if (b.richness !== a.richness) return b.richness - a.richness;
    return b.updatedAt - a.updatedAt;
  });

  return Response.json({ ok: true, candidates });
}
