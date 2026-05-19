import { describe, expect, it } from "vitest";

import { pickWinner, planMigration, richnessScore } from "@/lib/state-merge";
import type { StateBlob } from "@/lib/kv";

function blob(updatedAt: number, state: Record<string, unknown>): StateBlob {
  return { version: 1, updatedAt, state };
}

const EMPTY_STATE = {
  accounts: [],
  loans: [],
  incomes: [],
  rules: [],
  entries: [],
  monthlyBudget: 0,
};

const RICH_STATE = {
  accounts: [{ id: "a" }, { id: "b" }],
  loans: [{ id: "l1" }],
  incomes: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
  rules: [{ id: "r1" }, { id: "r2" }],
  entries: Array.from({ length: 50 }, (_, i) => ({ id: `e${i}` })),
  monthlyBudget: 8000,
};

describe("richnessScore", () => {
  it("returns 0 for an empty state", () => {
    expect(richnessScore(blob(0, EMPTY_STATE))).toBe(0);
  });

  it("counts items across all arrays + a non-zero budget", () => {
    expect(richnessScore(blob(0, RICH_STATE))).toBe(2 + 1 + 3 + 2 + 50 + 1);
  });

  it("does not count a zero budget", () => {
    const b = blob(0, { ...RICH_STATE, monthlyBudget: 0 });
    expect(richnessScore(b)).toBe(2 + 1 + 3 + 2 + 50);
  });

  it("treats missing arrays as 0", () => {
    expect(richnessScore(blob(0, {}))).toBe(0);
  });
});

describe("pickWinner", () => {
  it("picks the blob with the larger updatedAt", () => {
    const a = blob(100, EMPTY_STATE);
    const b = blob(200, EMPTY_STATE);
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it("on tie, picks the richer blob", () => {
    const a = blob(500, EMPTY_STATE);
    const b = blob(500, RICH_STATE);
    expect(pickWinner(a, b)).toBe(b);
    expect(pickWinner(b, a)).toBe(b);
  });

  it("on tie + equal richness, returns the first arg (stable)", () => {
    const a = blob(500, RICH_STATE);
    const b = blob(500, RICH_STATE);
    expect(pickWinner(a, b)).toBe(a);
  });

  it("non-empty beats empty regardless of timestamp", () => {
    const emptyNewer = blob(2000, EMPTY_STATE);
    const richOlder = blob(1000, RICH_STATE);
    expect(pickWinner(emptyNewer, richOlder)).toBe(richOlder);
    expect(pickWinner(richOlder, emptyNewer)).toBe(richOlder);
  });
});

describe("planMigration", () => {
  it("returns no-op when both blobs are null", () => {
    const plan = planMigration({ userBlob: null, deviceBlob: null, now: 100 });
    expect(plan.outcome).toBe("no-op");
    expect(plan.blob).toBeNull();
  });

  it("copies device to user when userBlob is null", () => {
    const dev = blob(500, RICH_STATE);
    const plan = planMigration({ userBlob: null, deviceBlob: dev, now: 999 });
    expect(plan.outcome).toBe("copied");
    expect(plan.blob).not.toBeNull();
    expect(plan.blob!.state).toEqual(RICH_STATE);
    expect(plan.blob!.updatedAt).toBe(999);
  });

  it("keeps user when deviceBlob is null", () => {
    const usr = blob(500, RICH_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: null, now: 999 });
    expect(plan.outcome).toBe("no-op");
    expect(plan.blob).toBeNull();
  });

  it("keeps the user blob when it's newer", () => {
    const usr = blob(1000, RICH_STATE);
    const dev = blob(500, EMPTY_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: dev, now: 999 });
    expect(plan.outcome).toBe("kept-user");
    expect(plan.blob).toBeNull();
  });

  it("device blob wins when user blob is empty regardless of timestamp", () => {
    const usr = blob(500, EMPTY_STATE);
    const dev = blob(1000, RICH_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: dev, now: 999 });
    expect(plan.outcome).toBe("copied");
    expect(plan.blob).not.toBeNull();
    expect(plan.blob!.state).toEqual(RICH_STATE);
    expect(plan.blob!.updatedAt).toBe(999);
  });

  it("device blob wins on tie when user is empty", () => {
    const usr = blob(500, EMPTY_STATE);
    const dev = blob(500, RICH_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: dev, now: 999 });
    expect(plan.outcome).toBe("copied");
    expect(plan.blob!.state).toEqual(RICH_STATE);
  });

  it("DATA SAFETY: empty newer user blob does NOT overwrite rich device", () => {
    // The exact bug Phase 71 fixes: user blob got accidentally PUT
    // empty (stale debounced write) so it has a newer updatedAt than
    // the device blob. Pre-fix this returned "kept-user" and the
    // device data was silently abandoned. Now device wins via the
    // empty-blob short-circuit.
    const usr = blob(2000, EMPTY_STATE);
    const dev = blob(1000, RICH_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: dev, now: 9999 });
    expect(plan.outcome).toBe("copied");
    expect(plan.blob!.state).toEqual(RICH_STATE);
  });

  it("keeps user on tie when user is equally rich (stable, no churn)", () => {
    const usr = blob(500, RICH_STATE);
    const dev = blob(500, RICH_STATE);
    const plan = planMigration({ userBlob: usr, deviceBlob: dev, now: 999 });
    expect(plan.outcome).toBe("kept-user");
    expect(plan.blob).toBeNull();
  });
});
