// Rollback snapshot management.
//
//   GET   → list every auto-snapshot captured before destructive ops
//           (pre-claim-device, pre-recover-device, pre-restore).
//           Newest first; each entry shows `capturedAt`, `reason`, and
//           a richness summary so the UI can rank them.
//
//   POST  → restore a specific snapshot back into the live user state
//           slot. Captures the CURRENT live state first (reason
//           "pre-restore") so the operation is itself reversible.
//
// Auth-gated. Operates only on the signed-in user's own snapshots.

import { auth } from "@/lib/auth/config";
import {
  captureStateSnapshot,
  isKvConfigured,
  listStateSnapshots,
  restoreFromSnapshot,
} from "@/lib/kv";
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
  if (!isKvConfigured()) {
    return Response.json({ ok: true, snapshots: [] });
  }
  const snapshots = await listStateSnapshots({ kind: "user", id: userId });
  return Response.json({
    ok: true,
    snapshots: snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      reason: s.reason,
      richness: richnessScore(s.blob),
      updatedAt: s.blob.updatedAt,
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: { capturedAt?: number } | null;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const capturedAt = body?.capturedAt;
  if (typeof capturedAt !== "number") {
    return fail(400, "missing_captured_at");
  }

  // Take a snapshot of the live state BEFORE restoring so this
  // operation itself can be undone.
  await captureStateSnapshot(
    { kind: "user", id: userId },
    "pre-restore",
  ).catch(() => undefined);

  const result = await restoreFromSnapshot(
    { kind: "user", id: userId },
    capturedAt,
  );
  if (!result.restored) {
    return Response.json({ ok: false, error: "snapshot_not_found" });
  }
  return Response.json({ ok: true });
}
