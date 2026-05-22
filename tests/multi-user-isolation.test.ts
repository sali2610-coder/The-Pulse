// @vitest-environment jsdom
//
// Multi-user isolation policy tests. Mirrors the auth-state handler
// branches in src/lib/supabase/use-cloud-sync.ts without React/
// Supabase so the rule itself is verifiable in isolation.

import { beforeEach, describe, expect, it } from "vitest";

import {
  readCacheOwner,
  writeCacheOwner,
} from "@/lib/local-safety-snapshots";

type AuthEvent =
  | { kind: "signed-in"; userId: string }
  | { kind: "signed-out" };

type Action =
  | "noop"
  | "first-claim"
  | "wipe-and-claim"
  | "wipe-on-signout";

/** Pure mirror of useCloudSync's handleSession logic. */
function decideAction(
  prevOwner: string | null,
  event: AuthEvent,
): Action {
  if (event.kind === "signed-out") {
    return prevOwner === null ? "noop" : "wipe-on-signout";
  }
  if (prevOwner === null) return "first-claim";
  if (prevOwner === event.userId) return "noop";
  return "wipe-and-claim";
}

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("cache-owner storage", () => {
  it("round-trips a user id", () => {
    writeCacheOwner("user-a");
    expect(readCacheOwner()).toBe("user-a");
  });

  it("clears when passed null", () => {
    writeCacheOwner("user-a");
    writeCacheOwner(null);
    expect(readCacheOwner()).toBeNull();
  });

  it("returns null when nothing was ever written", () => {
    expect(readCacheOwner()).toBeNull();
  });
});

describe("identity-swap policy", () => {
  it("first sign-in on a fresh device → first-claim", () => {
    expect(decideAction(null, { kind: "signed-in", userId: "user-a" })).toBe(
      "first-claim",
    );
  });

  it("same user re-authenticates → noop", () => {
    expect(
      decideAction("user-a", { kind: "signed-in", userId: "user-a" }),
    ).toBe("noop");
  });

  it("DIFFERENT user signs in → wipe-and-claim (the privacy fix)", () => {
    expect(
      decideAction("user-a", { kind: "signed-in", userId: "user-b" }),
    ).toBe("wipe-and-claim");
  });

  it("user signs out with prior session → wipe-on-signout", () => {
    expect(decideAction("user-a", { kind: "signed-out" })).toBe(
      "wipe-on-signout",
    );
  });

  it("sign-out on already-empty cache → noop", () => {
    expect(decideAction(null, { kind: "signed-out" })).toBe("noop");
  });

  it("third user signs in over second → wipe-and-claim again", () => {
    // After USER_B's wipe-and-claim, cache owner is user-b. Now user-c
    // arrives — must wipe again.
    expect(
      decideAction("user-b", { kind: "signed-in", userId: "user-c" }),
    ).toBe("wipe-and-claim");
  });
});

describe("push-suppression on ownership mismatch", () => {
  // Pure mirror of the cloud-sync reconcile branch.
  type Counts = {
    entries: number;
    rules: number;
    accounts: number;
    loans: number;
    incomes: number;
  };
  function reconcile(args: {
    localR: number;
    cloudR: number;
    ownershipMismatch: boolean;
  }): "apply-cloud" | "push-local" | "noop" {
    if (args.cloudR > args.localR) return "apply-cloud";
    if (args.cloudR < args.localR && !args.ownershipMismatch) {
      return "push-local";
    }
    return "noop";
  }
  void ({} as Counts);

  it("rich local + empty cloud + ownershipMismatch → noop (no leak)", () => {
    expect(
      reconcile({ localR: 30, cloudR: 0, ownershipMismatch: true }),
    ).toBe("noop");
  });

  it("rich local + empty cloud + same user → push-local (normal)", () => {
    expect(
      reconcile({ localR: 30, cloudR: 0, ownershipMismatch: false }),
    ).toBe("push-local");
  });

  it("empty local + rich cloud + ownershipMismatch → apply-cloud", () => {
    expect(
      reconcile({ localR: 0, cloudR: 30, ownershipMismatch: true }),
    ).toBe("apply-cloud");
  });
});
