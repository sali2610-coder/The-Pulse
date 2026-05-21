import { describe, expect, it } from "vitest";

import { _internal } from "@/lib/store-mutation-bridge";

const { diffById, shallowEqual } = _internal;

describe("diffById", () => {
  it("treats the empty-empty case as no change", () => {
    const d = diffById<{ id: string }>([], []);
    expect(d.added).toHaveLength(0);
    expect(d.updated).toHaveLength(0);
    expect(d.removedIds).toHaveLength(0);
  });

  it("picks up additions", () => {
    const d = diffById([{ id: "a" }, { id: "b" }], [{ id: "a" }]);
    expect(d.added.map((x) => x.id)).toEqual(["b"]);
    expect(d.updated).toHaveLength(0);
    expect(d.removedIds).toEqual([]);
  });

  it("picks up updates via shallow inequality", () => {
    const prev = [{ id: "a", amount: 10 }];
    const next = [{ id: "a", amount: 20 }];
    const d = diffById(next, prev);
    expect(d.updated.map((x) => x.id)).toEqual(["a"]);
    expect(d.added).toHaveLength(0);
    expect(d.removedIds).toEqual([]);
  });

  it("does not report updates when the row is shallow-equal", () => {
    const prev = [{ id: "a", amount: 10 }];
    const next = [{ id: "a", amount: 10 }];
    const d = diffById(next, prev);
    expect(d.updated).toHaveLength(0);
  });

  it("collects removed ids", () => {
    const d = diffById([{ id: "a" }], [{ id: "a" }, { id: "b" }]);
    expect(d.removedIds).toEqual(["b"]);
  });
});

describe("shallowEqual", () => {
  it("returns true on identity", () => {
    const a = { x: 1 };
    expect(shallowEqual(a, a)).toBe(true);
  });

  it("returns true on same shape", () => {
    expect(shallowEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });

  it("returns false on different key counts", () => {
    expect(shallowEqual({ x: 1 }, { x: 1, y: 2 })).toBe(false);
  });

  it("returns false on different values", () => {
    expect(shallowEqual({ x: 1 }, { x: 2 })).toBe(false);
  });

  it("returns false on null vs object", () => {
    expect(shallowEqual({ x: 1 }, null)).toBe(false);
    expect(shallowEqual(null, { x: 1 })).toBe(false);
  });
});
