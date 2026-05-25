// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetAnchorHistoryForTests,
  appendAnchorPoint,
  buildAnchorTrajectory,
  readAnchorHistory,
} from "@/lib/anchor-history";

beforeEach(() => _resetAnchorHistoryForTests());

describe("anchor-history", () => {
  it("starts empty", () => {
    expect(readAnchorHistory()).toEqual([]);
  });

  it("append + read round-trips", () => {
    appendAnchorPoint({
      accountId: "a",
      label: "Discount",
      balance: 1000,
      at: "2026-05-01T08:00:00.000Z",
    });
    const history = readAnchorHistory();
    expect(history).toHaveLength(1);
    expect(history[0].balance).toBe(1000);
  });

  it("dedups same-balance writes within 60s window", () => {
    appendAnchorPoint({
      accountId: "a",
      label: "X",
      balance: 500,
    });
    appendAnchorPoint({
      accountId: "a",
      label: "X",
      balance: 500,
    });
    expect(readAnchorHistory()).toHaveLength(1);
  });

  it("allows distinct balances back-to-back", () => {
    appendAnchorPoint({ accountId: "a", label: "X", balance: 100 });
    appendAnchorPoint({ accountId: "a", label: "X", balance: 200 });
    expect(readAnchorHistory()).toHaveLength(2);
  });

  it("buildAnchorTrajectory carries the last known balance per account forward", () => {
    appendAnchorPoint({
      accountId: "a",
      label: "X",
      balance: 1000,
      at: "2026-04-15T10:00:00.000Z",
    });
    appendAnchorPoint({
      accountId: "b",
      label: "Y",
      balance: 500,
      at: "2026-04-20T10:00:00.000Z",
    });
    const trajectory = buildAnchorTrajectory({
      now: new Date("2026-05-01T08:00:00.000Z"),
      windowDays: 7,
    });
    // Every day in the window sees the combined total of last-known
    // per-account balances → 1500.
    expect(trajectory).toHaveLength(7);
    for (const point of trajectory) {
      expect(point.balance).toBe(1500);
    }
  });

  it("empty history → empty trajectory", () => {
    expect(buildAnchorTrajectory({ windowDays: 30 })).toEqual([]);
  });
});
