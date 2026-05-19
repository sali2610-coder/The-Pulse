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

  // Bound concurrency so a large KV doesn't fan out into hundreds of
  // simultaneous requests.
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
    if (claim && claim !== userId) continue; // someone else's

    const blob = await getUserState({ kind: "device", id: deviceId });
    if (!blob) continue;

    const richness = richnessScore(blob);
    const txCount = (
      await pullTransactionsSince(
        { kind: "device", id: deviceId },
        0,
      ).catch(() => [])
    ).length;

    // Skip empty blobs so the UI doesn't list dozens of nothings.
    if (richness === 0 && txCount === 0) continue;

    candidates.push({
      deviceId,
      richness,
      updatedAt: blob.updatedAt,
      txCount,
      claimedByMe: claim === userId,
    });
  }

  candidates.sort((a, b) => {
    // Richer first; tie-break by newer updatedAt.
    if (b.richness !== a.richness) return b.richness - a.richness;
    return b.updatedAt - a.updatedAt;
  });

  return Response.json({ ok: true, candidates });
}
