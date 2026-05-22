// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  captureEvent,
  clearEvents,
  listEvents,
  subscribeEvents,
  _resetAnalyticsForTests,
} from "@/lib/analytics";

beforeEach(() => {
  _resetAnalyticsForTests();
});

describe("captureEvent", () => {
  it("records a bare event with name", () => {
    captureEvent("expense_added");
    const list = listEvents();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("expense_added");
    expect(list[0].props).toBeUndefined();
  });

  it("persists scalar props", () => {
    captureEvent("expense_added", {
      source: "manual",
      installments: 3,
      hasMerchant: true,
    });
    const ev = listEvents()[0];
    expect(ev.props).toEqual({
      source: "manual",
      installments: 3,
      hasMerchant: true,
    });
  });

  it("strips object / array props (PII guard)", () => {
    captureEvent("x", {
      ok: true,
      nested: { secret: "no" },
      arr: [1, 2, 3],
    });
    expect(listEvents()[0].props).toEqual({ ok: true });
  });

  it("returns undefined props when nothing survives sanitization", () => {
    captureEvent("x", { nested: { a: 1 } });
    expect(listEvents()[0].props).toBeUndefined();
  });
});

describe("listEvents / clearEvents", () => {
  it("returns newest first", async () => {
    captureEvent("first");
    await new Promise((r) => setTimeout(r, 2));
    captureEvent("second");
    const list = listEvents();
    expect(list[0].name).toBe("second");
    expect(list[1].name).toBe("first");
  });

  it("clearEvents wipes the log", () => {
    captureEvent("x");
    clearEvents();
    expect(listEvents()).toEqual([]);
  });

  it("FIFO trim at 200 — drops oldest", () => {
    for (let i = 0; i < 210; i++) captureEvent(`e${i}`);
    const list = listEvents();
    expect(list).toHaveLength(200);
    const names = new Set(list.map((e) => e.name));
    expect(names.has("e0")).toBe(false);
    expect(names.has("e9")).toBe(false);
    expect(names.has("e10")).toBe(true);
    expect(names.has("e209")).toBe(true);
  });
});

describe("subscribeEvents", () => {
  it("notifies live subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeEvents((ev) => seen.push(ev.name));
    captureEvent("a");
    captureEvent("b");
    unsub();
    captureEvent("c");
    expect(seen).toEqual(["a", "b"]);
  });

  it("crashing listener doesn't break the rest", () => {
    const ok: string[] = [];
    subscribeEvents(() => {
      throw new Error("boom");
    });
    subscribeEvents((ev) => ok.push(ev.name));
    captureEvent("x");
    expect(ok).toEqual(["x"]);
  });
});
