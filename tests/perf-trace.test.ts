import { beforeEach, describe, expect, it } from "vitest";

import {
  beginSpan,
  clearSpans,
  isOverBudget,
  listSpans,
  measureAsync,
  PERF_BUDGETS,
} from "@/lib/perf-trace";

beforeEach(() => {
  clearSpans();
});

describe("perf-trace", () => {
  it("records a span with non-negative duration on end", () => {
    const s = beginSpan("test.fast").end();
    expect(s.name).toBe("test.fast");
    expect(s.duration).toBeGreaterThanOrEqual(0);
  });

  it("listSpans returns newest first", () => {
    beginSpan("a").end();
    beginSpan("b").end();
    beginSpan("c").end();
    const names = listSpans().map((s) => s.name);
    expect(names).toEqual(["c", "b", "a"]);
  });

  it("caps the ring buffer at 100 entries", () => {
    for (let i = 0; i < 130; i++) {
      beginSpan(`s${i}`).end();
    }
    expect(listSpans().length).toBe(100);
  });

  it("measureAsync resolves with both result and span", async () => {
    const { result, span } = await measureAsync(
      "test.async",
      async () => 42,
    );
    expect(result).toBe(42);
    expect(span.name).toBe("test.async");
  });

  it("merges initial + final metadata", () => {
    const h = beginSpan("metaTest", { a: 1 });
    const s = h.end({ b: 2 });
    expect(s.meta).toEqual({ a: 1, b: 2 });
  });

  it("isOverBudget flags spans exceeding a declared budget", () => {
    const fakeSpan = {
      name: "quick-add.open" as const,
      startedAt: 0,
      endedAt: PERF_BUDGETS["quick-add.open"] + 50,
      duration: PERF_BUDGETS["quick-add.open"] + 50,
    };
    expect(isOverBudget(fakeSpan)).toBe(true);
  });

  it("isOverBudget returns false for unknown span names", () => {
    expect(
      isOverBudget({
        name: "random.unknown",
        startedAt: 0,
        endedAt: 999_999,
        duration: 999_999,
      }),
    ).toBe(false);
  });

  it("clearSpans wipes the buffer", () => {
    beginSpan("x").end();
    clearSpans();
    expect(listSpans()).toHaveLength(0);
  });
});
