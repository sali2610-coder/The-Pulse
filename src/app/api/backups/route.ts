// Backup catalog endpoint.
//
//   GET  → enumerate every snapshot tied to the signed-in user,
//          newest first. Each row carries a richness summary +
//          per-entity counts so the UI can preview before restoring.
//   POST → take a `manual` snapshot of the current live blob and
//          return its capturedAt id. Empty blobs are rejected so the
//          user can't accidentally pin a zero-state.
//
// Auth gated. Per-user only. Does NOT touch the existing
// /api/auth/snapshots route — they read the same KV sorted set, but
// this surface is the user-visible "Backups" inventory.

import { auth } from "@/lib/auth/config";
import {
  captureStateSnapshot,
  getUserState,
  isKvConfigured,
  listStateSnapshots,
} from "@/lib/kv";
import { richnessScore, summarizeBlob } from "@/lib/state-merge";

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
    return Response.json({
      ok: true,
      configured: false,
      current: null,
      backups: [],
    });
  }
  const scope = { kind: "user", id: userId } as const;
  const [current, snapshots] = await Promise.all([
    getUserState(scope),
    listStateSnapshots(scope),
  ]);
  return Response.json({
    ok: true,
    configured: true,
    current: current
      ? {
          updatedAt: current.updatedAt,
          ...summarizeBlob(current),
        }
      : null,
    backups: snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      reason: s.reason,
      ...summarizeBlob(s.blob),
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return fail(401, "unauthenticated");
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  // Accept an optional `reason` so the client-side auto-backup loop
  // can label its writes as "auto" and live in its own retention
  // bucket. Default stays "manual" for the settings card button.
  let reason: "manual" | "auto" = "manual";
  try {
    const body = (await req.json().catch(() => null)) as
      | { reason?: string }
      | null;
    if (body?.reason === "auto") reason = "auto";
  } catch {
    /* empty body → manual */
  }

  const scope = { kind: "user", id: userId } as const;
  const live = await getUserState(scope);
  if (!live) {
    return Response.json(
      { ok: false, error: "no_live_state" },
      { status: 404 },
    );
  }
  if (richnessScore(live) === 0) {
    return Response.json(
      { ok: false, error: "empty_state_not_backed_up" },
      { status: 400 },
    );
  }
  const result = await captureStateSnapshot(scope, reason);
  if (!result.captured) return fail(500, "capture_failed");
  return Response.json({
    ok: true,
    reason,
    capturedAt: result.capturedAt,
    summary: summarizeBlob(live),
  });
}
