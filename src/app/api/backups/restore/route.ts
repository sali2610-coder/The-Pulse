// Backup restore endpoint.
//
// Safer wrapper around the existing `restoreFromSnapshot` primitive:
//   1. Always takes a `pre-restore` snapshot of the CURRENT live blob
//      so the user can undo the restore in one tap.
//   2. Refuses to overwrite a rich current state with an empty backup
//      unless the caller passes `confirmEmpty: true`.
//   3. Returns before/after summaries so the UI can show "X entries
//      restored, Y previous state preserved".

import { getServerUser } from "@/lib/supabase/server-client";
import {
  appendBackupLog,
  captureStateSnapshot,
  getUserState,
  isKvConfigured,
  listStateSnapshots,
  restoreFromSnapshot,
} from "@/lib/kv";
import { richnessScore, summarizeBlob } from "@/lib/state-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string, extra?: Record<string, unknown>) {
  return Response.json(
    { ok: false, error: code, ...(extra ?? {}) },
    { status },
  );
}

export async function POST(req: Request): Promise<Response> {
  const user = await getServerUser();
  const userId = user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  let body: { capturedAt?: number; confirmEmpty?: boolean } | null;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const capturedAt = body?.capturedAt;
  if (typeof capturedAt !== "number") {
    return fail(400, "missing_captured_at");
  }
  const confirmEmpty = body?.confirmEmpty === true;

  const scope = { kind: "user", id: userId } as const;
  const snapshots = await listStateSnapshots(scope);
  const target = snapshots.find((s) => s.capturedAt === capturedAt);
  if (!target) return fail(404, "snapshot_not_found");

  const live = await getUserState(scope);
  const liveRichness = live ? richnessScore(live) : 0;
  const targetRichness = richnessScore(target.blob);

  // Anti-foot-gun: empty backup on top of rich state requires the
  // caller to opt in explicitly.
  if (liveRichness > 0 && targetRichness === 0 && !confirmEmpty) {
    await appendBackupLog(scope, {
      ts: Date.now(),
      kind: "restore-blocked-empty",
      capturedAt,
      counts: summarizeBlob(live),
      ok: false,
      note: "empty_backup_blocked",
    }).catch(() => undefined);
    return Response.json(
      {
        ok: false,
        error: "empty_backup_blocked",
        liveSummary: summarizeBlob(live),
        targetSummary: summarizeBlob(target.blob),
      },
      { status: 409 },
    );
  }

  // Always snapshot the live state before restoring. If the snapshot
  // store also holds nothing live, capture is a no-op and we proceed.
  const preRestore = await captureStateSnapshot(scope, "pre-restore").catch(
    () => ({ captured: false, capturedAt: null }),
  );
  if (preRestore.captured) {
    await appendBackupLog(scope, {
      ts: Date.now(),
      kind: "backup-pre-restore",
      capturedAt: preRestore.capturedAt ?? undefined,
      counts: summarizeBlob(live),
      ok: true,
    }).catch(() => undefined);
  }

  const result = await restoreFromSnapshot(scope, capturedAt);
  if (!result.restored) return fail(500, "restore_failed");

  await appendBackupLog(scope, {
    ts: Date.now(),
    kind: "restore",
    capturedAt,
    counts: summarizeBlob(target.blob),
    ok: true,
  }).catch(() => undefined);

  return Response.json({
    ok: true,
    beforeSummary: summarizeBlob(live),
    afterSummary: summarizeBlob(target.blob),
  });
}
