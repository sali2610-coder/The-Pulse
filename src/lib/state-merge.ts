// Pure merge primitives for the device→user state migration.
//
// Extracted from /api/auth/claim-device so the policy can be unit-tested
// without a KV mock and reused by the recovery route.

import type { StateBlob } from "@/lib/kv";

type AnyBlobState = {
  accounts?: unknown[];
  loans?: unknown[];
  incomes?: unknown[];
  rules?: unknown[];
  entries?: unknown[];
  monthlyBudget?: number;
} & Record<string, unknown>;

/** Count of meaningful items in the blob. Used to break ties when two
 *  blobs share `updatedAt` — we always prefer the richer one so we don't
 *  silently delete user data. */
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

/** Pick the winning blob between two non-null candidates.
 *  Larger `updatedAt` wins; ties go to the richer blob. */
export function pickWinner(a: StateBlob, b: StateBlob): StateBlob {
  if (a.updatedAt > b.updatedAt) return a;
  if (b.updatedAt > a.updatedAt) return b;
  return richnessScore(a) >= richnessScore(b) ? a : b;
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
