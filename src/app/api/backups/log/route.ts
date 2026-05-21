// Backup audit log endpoint.
//
// GET → newest-first list of backup / restore events tied to the
// signed-in user. Drives the "יומן" expander in BackupsCard so
// the user can prove their backups happened.

import { auth } from "@/lib/auth/config";
import { isKvConfigured, listBackupLog } from "@/lib/kv";

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
    return Response.json({ ok: true, configured: false, log: [] });
  }
  const log = await listBackupLog({ kind: "user", id: userId });
  return Response.json({ ok: true, configured: true, log });
}
