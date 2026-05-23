// Pure-logic tests for the cloud-sync write-loop diff. Mirrors the
// upsertChanged + deleteRemoved + monthlyBudget-change branches in
// use-cloud-sync.ts so the policy itself is verifiable without a
// Supabase round-trip.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Row = { id: string; value?: number };

function diffEntities(prev: Row[], curr: Row[]) {
  const prevById = new Map(prev.map((p) => [p.id, p] as const));
  const currIds = new Set(curr.map((c) => c.id));
  const upserted: Row[] = [];
  const deletedIds: string[] = [];
  for (const item of curr) {
    const old = prevById.get(item.id);
    if (old !== item) upserted.push(item);
  }
  for (const old of prev) {
    if (!currIds.has(old.id)) deletedIds.push(old.id);
  }
  return { upserted, deletedIds };
}

describe("cloud write-loop diff", () => {
  it("treats empty-empty as no work", () => {
    const d = diffEntities([], []);
    expect(d.upserted).toEqual([]);
    expect(d.deletedIds).toEqual([]);
  });

  it("upserts adds", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const d = diffEntities([a], [a, b]);
    expect(d.upserted).toEqual([b]);
    expect(d.deletedIds).toEqual([]);
  });

  it("upserts ref-different updates (edit by replacement)", () => {
    const oldA = { id: "a", value: 100 };
    const newA = { id: "a", value: 200 };
    const d = diffEntities([oldA], [newA]);
    expect(d.upserted).toEqual([newA]);
    expect(d.deletedIds).toEqual([]);
  });

  it("does NOT upsert when ref unchanged", () => {
    const a = { id: "a", value: 100 };
    const d = diffEntities([a], [a]);
    expect(d.upserted).toEqual([]);
  });

  it("emits deletedIds for removed rows", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const d = diffEntities([a, b], [a]);
    expect(d.deletedIds).toEqual(["b"]);
    expect(d.upserted).toEqual([]);
  });

  it("delete-then-recreate with same id → upsert + no delete", () => {
    const oldA = { id: "a", value: 1 };
    const newA = { id: "a", value: 2 };
    const d = diffEntities([oldA], [newA]);
    expect(d.deletedIds).toEqual([]);
    expect(d.upserted).toEqual([newA]);
  });

  it("multiple deletes in one tick", () => {
    const d = diffEntities(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [{ id: "a" }],
    );
    expect(d.deletedIds.sort()).toEqual(["b", "c"]);
  });
});

describe("monthlyBudget change detection", () => {
  // Cast through `as number` so TS doesn't narrow to literal types and
  // complain about no-overlap comparisons. The runtime check is what
  // we care about.
  function changed(prev: number, next: number): boolean {
    return next !== prev;
  }

  it("fires write when value changes", () => {
    expect(changed(5000, 4500)).toBe(true);
  });

  it("skips write when unchanged", () => {
    expect(changed(5000, 5000)).toBe(false);
  });

  it("0 → positive triggers (initial set)", () => {
    expect(changed(0, 1000)).toBe(true);
  });

  it("positive → 0 triggers (user cleared)", () => {
    expect(changed(5000, 0)).toBe(true);
  });
});

describe("settings reconcile policy", () => {
  // Pure mirror of the use-cloud-sync settings branch.
  function decide(args: {
    cloud: number;
    local: number;
    ownershipMismatch: boolean;
  }): "apply-cloud" | "push-local" | "noop" {
    if (args.cloud > 0) {
      return args.cloud !== args.local ? "apply-cloud" : "noop";
    }
    if (args.local > 0 && !args.ownershipMismatch) return "push-local";
    return "noop";
  }

  it("cloud 5000, local 0 → apply-cloud", () => {
    expect(decide({ cloud: 5000, local: 0, ownershipMismatch: false })).toBe(
      "apply-cloud",
    );
  });

  it("cloud 5000, local 5000 → noop", () => {
    expect(decide({ cloud: 5000, local: 5000, ownershipMismatch: false })).toBe(
      "noop",
    );
  });

  it("cloud 5000, local 4500 → apply-cloud (cloud wins)", () => {
    expect(decide({ cloud: 5000, local: 4500, ownershipMismatch: false })).toBe(
      "apply-cloud",
    );
  });

  it("cloud 0, local 5000 → push-local", () => {
    expect(decide({ cloud: 0, local: 5000, ownershipMismatch: false })).toBe(
      "push-local",
    );
  });

  it("cloud 0, local 5000, ownershipMismatch → noop (no leak)", () => {
    expect(decide({ cloud: 0, local: 5000, ownershipMismatch: true })).toBe(
      "noop",
    );
  });

  it("cloud 0, local 0 → noop", () => {
    expect(decide({ cloud: 0, local: 0, ownershipMismatch: false })).toBe(
      "noop",
    );
  });
});

describe("write-loop effect dep array (Bug 1 regression)", () => {
  // The write-loop subscription must NOT depend on `state.reconnectTick`.
  // If it does, every visibility/online tick tears down the subscription
  // and cancels any pending 1.5s debounce — silently dropping a save
  // that happened in the window. This was Bug 1 (May 2026): edits to a
  // bank-account anchor only persisted on the first save, then any
  // subsequent edit could be dropped if a focus event fired before the
  // debounce flushed. Retry-drain on reconnect lives in its own effect.
  const src = readFileSync(
    resolve(__dirname, "../src/lib/supabase/use-cloud-sync.ts"),
    "utf8",
  );

  it("write-loop effect deps exclude reconnectTick", () => {
    // Grab every dep array in the file and look at the one that closes
    // the write-loop effect (immediately above the comment that opens
    // the reconnect-tick drain effect).
    const marker = "// Drain the retry queue on every reconnect / foreground tick";
    const idx = src.indexOf(marker);
    expect(idx).toBeGreaterThan(0);
    const writeLoopRegion = src.slice(0, idx);
    // The last `}, [ ... ]);` before the marker is the write-loop effect's
    // dep array.
    const depMatches = [...writeLoopRegion.matchAll(/}, \[(.*?)\]\)/g)];
    expect(depMatches.length).toBeGreaterThan(0);
    const last = depMatches[depMatches.length - 1][1];
    expect(last).toContain("state.hydrated");
    expect(last).toContain("state.authenticated");
    expect(last).not.toContain("reconnectTick");
  });
});
