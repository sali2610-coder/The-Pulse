// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  captureError,
  clearErrors,
  listErrors,
  subscribeErrors,
  _resetErrorLogForTests,
} from "@/lib/error-log";

beforeEach(() => {
  _resetErrorLogForTests();
});

describe("captureError", () => {
  it("persists an Error with message + stack", () => {
    captureError(new Error("boom"), "manual");
    const list = listErrors();
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe("boom");
    expect(list[0].stack).toBeTruthy();
    expect(list[0].source).toBe("manual");
  });

  it("accepts strings", () => {
    captureError("just text", "manual");
    expect(listErrors()[0].message).toBe("just text");
  });

  it("accepts unknown values via 'unknown_error' fallback", () => {
    captureError({ random: 1 }, "manual");
    expect(listErrors()[0].message).toBe("unknown_error");
  });

  it("attaches ctx", () => {
    captureError("x", "manual", { route: "/dashboard", attempt: 2 });
    expect(listErrors()[0].ctx).toEqual({ route: "/dashboard", attempt: 2 });
  });
});

describe("listErrors / clearErrors", () => {
  it("returns newest first", async () => {
    captureError("first", "manual");
    await new Promise((r) => setTimeout(r, 2));
    captureError("second", "manual");
    const list = listErrors();
    expect(list[0].message).toBe("second");
    expect(list[1].message).toBe("first");
  });

  it("clears the persisted log", () => {
    captureError("x", "manual");
    expect(listErrors()).toHaveLength(1);
    clearErrors();
    expect(listErrors()).toEqual([]);
  });

  it("FIFO trim at 50 entries — drops the oldest 10", () => {
    for (let i = 0; i < 60; i++) captureError(`e${i}`, "manual");
    const list = listErrors();
    expect(list).toHaveLength(50);
    // The 10 oldest must have been evicted (e0..e9).
    const messages = new Set(list.map((e) => e.message));
    for (let i = 0; i < 10; i++) {
      expect(messages.has(`e${i}`)).toBe(false);
    }
    // The 10 newest must still be there (e50..e59).
    for (let i = 50; i < 60; i++) {
      expect(messages.has(`e${i}`)).toBe(true);
    }
  });
});

describe("subscribeErrors", () => {
  it("notifies live subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeErrors((e) => seen.push(e.message));
    captureError("a", "manual");
    captureError("b", "manual");
    unsub();
    captureError("c", "manual");
    expect(seen).toEqual(["a", "b"]);
  });

  it("isolates a crashing listener — other subscribers still fire", () => {
    const ok: string[] = [];
    subscribeErrors(() => {
      throw new Error("listener crashed");
    });
    subscribeErrors((e) => ok.push(e.message));
    captureError("x", "manual");
    expect(ok).toEqual(["x"]);
  });
});
