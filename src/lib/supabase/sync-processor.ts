// Mutation-queue → Supabase sync processor.
//
// Drains the Phase 138 mutation queue against Supabase tables.
// Each mutation kind maps to a specific table; the payload format is
// owned by the consumer that enqueues it. Successful writes get
// `ackMutation`-ed; failures bump the retry counter via
// `failMutation` so the existing exponential-backoff guard fires.
//
// Idempotency: every supported mutation kind uses an `upsert` keyed
// on the row's stable id so a replay (e.g. after network recovery)
// is safe.
//
// Dormant when Supabase env isn't configured. Calling
// `runSyncOnce()` in that state is a silent no-op.

import {
  ackMutation,
  failMutation,
  listMutations,
  type Mutation,
} from "@/lib/mutation-queue";

import { getCurrentSession } from "./auth";
import { supabase } from "./client";

type SupportedTable =
  | "expense_entries"
  | "accounts"
  | "recurring_rules"
  | "loans"
  | "incomes";

/** Map mutation `kind` → DB table. Unknown kinds are skipped (and
 *  acked so they don't clog the queue). Keep this list small + add
 *  entries explicitly as consumers wire in. */
const KIND_TO_TABLE: Record<string, SupportedTable | null> = {
  "expense.add": "expense_entries",
  "expense.update": "expense_entries",
  "account.upsert": "accounts",
  "rule.upsert": "recurring_rules",
  "loan.upsert": "loans",
  "income.upsert": "incomes",
};

export type SyncStats = {
  attempted: number;
  ok: number;
  failed: number;
  skipped: number;
  reason?: string;
};

async function applyOne(m: Mutation, userId: string): Promise<boolean> {
  const client = supabase();
  if (!client) return false;
  const table = KIND_TO_TABLE[m.kind];
  if (table === undefined) {
    // Unknown kind — ack to clear the queue head; the consumer can
    // re-add a typed kind once the schema lands.
    ackMutation(m.id);
    return false;
  }
  if (table === null) {
    ackMutation(m.id);
    return false;
  }
  const row = m.payload as Record<string, unknown> & { id?: string };
  if (!row || typeof row !== "object" || !row.id) {
    failMutation(m.id, "missing_id");
    return false;
  }
  const payload = {
    ...row,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  // The mutation queue is untyped on purpose — payload shape is owned
  // by the consumer that enqueues. Cast through unknown for the
  // upsert; RLS + table CHECK constraints enforce shape server-side.
  const builder = client.from(table) as unknown as {
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await builder.upsert(payload, { onConflict: "id" });
  if (error) {
    failMutation(m.id, error.message);
    return false;
  }
  ackMutation(m.id);
  return true;
}

/** Drain pending mutations once. Safe to call from a focus/visibility
 *  listener — the underlying queue already gates each entry on its
 *  `nextAttemptAt` so backed-off mutations stay backed off. */
export async function runSyncOnce(now = Date.now()): Promise<SyncStats> {
  const client = supabase();
  if (!client) {
    return { attempted: 0, ok: 0, failed: 0, skipped: 0, reason: "not_configured" };
  }
  const session = await getCurrentSession();
  if (!session) {
    return { attempted: 0, ok: 0, failed: 0, skipped: 0, reason: "no_session" };
  }

  const stats: SyncStats = { attempted: 0, ok: 0, failed: 0, skipped: 0 };
  const all = listMutations();
  for (const m of all) {
    if (m.nextAttemptAt && m.nextAttemptAt > now) {
      stats.skipped++;
      continue;
    }
    stats.attempted++;
    const ok = await applyOne(m, session.userId);
    if (ok) stats.ok++;
    else stats.failed++;
  }
  return stats;
}
