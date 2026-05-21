// Standalone, deterministic guard tests for the richness checks the
// remote-state-sync hook uses. These run the pure decision logic
// directly so the suite doesn't have to spin up React + Zustand.

import { describe, expect, it } from "vitest";

import { richness } from "@/lib/local-safety-snapshots";

type LocalState = {
  entries: number;
  rules: number;
  accounts: number;
  loans: number;
  incomes: number;
  monthlyBudget: number;
};

type RemoteState = LocalState;

type Decision =
  | { apply: true; reason: "remote-newer-or-empty-local" }
  | { apply: false; reason: string };

// Mirrors the isFirstEver / isSameIdentity branch in remote-state-sync.
function decideSameIdentity(args: {
  local: LocalState;
  remote: RemoteState;
  remoteUpdatedAt: number;
  localLastSyncedAt: number;
}): Decision {
  const localR = richness(args.local);
  const remoteR = richness(args.remote);
  const localEmpty = localR === 0;
  if (remoteR === 0 && localR > 0) {
    return { apply: false, reason: "empty_remote_blocked" };
  }
  if (remoteR > 0 && remoteR < localR / 2 && !localEmpty) {
    return { apply: false, reason: "remote_much_smaller" };
  }
  const remoteWins =
    localEmpty || args.remoteUpdatedAt > (args.localLastSyncedAt ?? 0);
  return remoteWins
    ? { apply: true, reason: "remote-newer-or-empty-local" }
    : { apply: false, reason: "local-newer" };
}

// Mirrors the isUserSwap branch.
function decideUserSwap(args: {
  local: LocalState;
  remote: RemoteState | null;
}): Decision {
  const localR = richness(args.local);
  const remoteR = args.remote ? richness(args.remote) : 0;
  if (args.remote && remoteR > 0) {
    return { apply: true, reason: "remote-newer-or-empty-local" };
  }
  if (localR === 0) {
    return { apply: true, reason: "remote-newer-or-empty-local" };
  }
  return { apply: false, reason: "user_swap_keeps_local" };
}

// Mirrors the device→user branch.
function decideDeviceToUser(args: {
  local: LocalState;
  remote: RemoteState | null;
}): Decision {
  const localR = richness(args.local);
  const remoteR = args.remote ? richness(args.remote) : 0;
  if (args.remote && remoteR >= localR) {
    return { apply: true, reason: "remote-newer-or-empty-local" };
  }
  if (args.remote && remoteR > 0 && remoteR < localR) {
    return { apply: false, reason: "device_to_user_remote_smaller" };
  }
  return { apply: false, reason: "device_to_user_keep_local" };
}

const RICH: LocalState = {
  entries: 30,
  rules: 5,
  accounts: 2,
  loans: 1,
  incomes: 1,
  monthlyBudget: 6000,
};
const EMPTY: LocalState = {
  entries: 0,
  rules: 0,
  accounts: 0,
  loans: 0,
  incomes: 0,
  monthlyBudget: 0,
};

describe("remote-state-sync richness guards", () => {
  it("same identity: blocks empty remote on top of rich local", () => {
    const out = decideSameIdentity({
      local: RICH,
      remote: EMPTY,
      remoteUpdatedAt: 99_999_999_999,
      localLastSyncedAt: 0,
    });
    expect(out.apply).toBe(false);
    if (!out.apply) expect(out.reason).toBe("empty_remote_blocked");
  });

  it("same identity: blocks remote much smaller than local", () => {
    const out = decideSameIdentity({
      local: RICH,
      remote: { ...EMPTY, accounts: 1 },
      remoteUpdatedAt: 99_999_999_999,
      localLastSyncedAt: 0,
    });
    expect(out.apply).toBe(false);
  });

  it("same identity: applies when remote is newer + comparable", () => {
    const out = decideSameIdentity({
      local: RICH,
      remote: { ...RICH, entries: RICH.entries + 5 },
      remoteUpdatedAt: 2,
      localLastSyncedAt: 1,
    });
    expect(out.apply).toBe(true);
  });

  it("user-swap: blocks empty remote on rich local", () => {
    const out = decideUserSwap({ local: RICH, remote: null });
    expect(out.apply).toBe(false);
    if (!out.apply) expect(out.reason).toBe("user_swap_keeps_local");
  });

  it("user-swap: allows rich remote on rich local", () => {
    const out = decideUserSwap({
      local: RICH,
      remote: { ...RICH, entries: 50 },
    });
    expect(out.apply).toBe(true);
  });

  it("user-swap: allows any remote on empty local", () => {
    const out = decideUserSwap({ local: EMPTY, remote: EMPTY });
    expect(out.apply).toBe(true);
  });

  it("device-to-user: blocks smaller remote", () => {
    const out = decideDeviceToUser({
      local: RICH,
      remote: { ...EMPTY, accounts: 1, entries: 2 },
    });
    expect(out.apply).toBe(false);
  });

  it("device-to-user: applies remote >= local", () => {
    const out = decideDeviceToUser({
      local: RICH,
      remote: { ...RICH, entries: RICH.entries + 10 },
    });
    expect(out.apply).toBe(true);
  });
});
