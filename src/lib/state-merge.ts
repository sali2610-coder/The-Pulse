// Pure merge primitives for the device→user state migration.
//
// Extracted from /api/auth/claim-device so the policy can be unit-tested
// without a KV mock and reused by the recovery route.
//
// HARD RULE (Phase 71): never let an EMPTY blob beat a non-empty one,
// regardless of `updatedAt`. A previous deploy could have PUT an empty
// state to the user blob (debounced PUT firing before remote-state-sync
// applied the device's data), giving us an "emptier but newer" user
// blob that would silently wipe months of real data on the next
// migration. The richness check now short-circuits the timestamp tie-
// break.

import type { StateBlob } from "@/lib/kv";

type AnyBlobState = {
  accounts?: unknown[];
  loans?: unknown[];
  incomes?: unknown[];
  rules?: unknown[];
  entries?: unknown[];
  monthlyBudget?: number;
} & Record<string, unknown>;

/** Count of meaningful items in the blob. */
export function richnessScore(blob: StateBlob): number {
  const s = (blob.state ?? {}) as AnyBlobState;
  const count = (a?: unknown[]) => (Array.isArray(a) ? a.length : 0);
  return (
    count(s.accounts) +
    count(s.loans) +
    count(s.incomes) +
    count(s.rules) +
    count(s.entries) +
    (typeof s.monthlyBudget === "number" && s.monthlyBudget > 0 ? 1 : 0)
  );
}

export type BlobSummary = {
  entries: number;
  accounts: number;
  loans: number;
  rules: number;
  incomes: number;
  statuses: number;
  monthlyBudget: number;
  richness: number;
};

/** Detailed per-entity counts for backup previews. */
export function summarizeBlob(blob: StateBlob | null): BlobSummary {
  if (!blob) {
    return {
      entries: 0,
      accounts: 0,
      loans: 0,
      rules: 0,
      incomes: 0,
      statuses: 0,
      monthlyBudget: 0,
      richness: 0,
    };
  }
  const s = (blob.state ?? {}) as AnyBlobState & { statuses?: unknown[] };
  const count = (a?: unknown[]) => (Array.isArray(a) ? a.length : 0);
  return {
    entries: count(s.entries),
    accounts: count(s.accounts),
    loans: count(s.loans),
    rules: count(s.rules),
    incomes: count(s.incomes),
    statuses: count(s.statuses),
    monthlyBudget:
      typeof s.monthlyBudget === "number" ? s.monthlyBudget : 0,
    richness: richnessScore(blob),
  };
}

/** True when the blob has no user-meaningful content. */
export function isEmptyBlob(blob: StateBlob): boolean {
  return richnessScore(blob) === 0;
}

/**
 * Pick the winning blob between two non-null candidates.
 *
 * Priority order:
 *   1. NON-EMPTY beats empty unconditionally (data safety).
 *   2. Larger `updatedAt` wins.
 *   3. Tie on `updatedAt` → richer blob wins.
 */
export function pickWinner(a: StateBlob, b: StateBlob): StateBlob {
  const ra = richnessScore(a);
  const rb = richnessScore(b);
  if (ra === 0 && rb > 0) return b;
  if (rb === 0 && ra > 0) return a;
  if (a.updatedAt > b.updatedAt) return a;
  if (b.updatedAt > a.updatedAt) return b;
  return ra >= rb ? a : b;
}

export type MigrationOutcome = "copied" | "merged" | "kept-user" | "no-op";

/** Decide what should land under the user scope given the existing user
 *  blob and the device blob. Returns the winning blob to save plus a
 *  human-readable outcome tag. Returning `null` means write nothing. */
export function planMigration(args: {
  userBlob: StateBlob | null;
  deviceBlob: StateBlob | null;
  now: number;
}): { blob: StateBlob | null; outcome: MigrationOutcome } {
  const { userBlob, deviceBlob, now } = args;

  if (!userBlob && deviceBlob) {
    return {
      blob: {
        version: deviceBlob.version,
        updatedAt: now,
        state: deviceBlob.state,
      },
      outcome: "copied",
    };
  }
  if (userBlob && deviceBlob) {
    // Special case: empty user blob + non-empty device blob → adopt
    // device. Phase 71 — used to incorrectly fall through to kept-user
    // when user.updatedAt > device.updatedAt.
    if (isEmptyBlob(userBlob) && !isEmptyBlob(deviceBlob)) {
      return {
        blob: {
          version: deviceBlob.version,
          updatedAt: now,
          state: deviceBlob.state,
        },
        outcome: "copied",
      };
    }
    const winner = pickWinner(userBlob, deviceBlob);
    if (winner !== userBlob) {
      return {
        blob: {
          version: winner.version,
          updatedAt: now,
          state: winner.state,
        },
        outcome: "merged",
      };
    }
    return { blob: null, outcome: "kept-user" };
  }
  return { blob: null, outcome: "no-op" };
}
