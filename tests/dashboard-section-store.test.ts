// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  readSectionCollapsed,
  writeSectionCollapsed,
  resetAllCollapseState,
  subscribeCollapseState,
  _resetDashboardSectionsForTests,
} from "@/lib/dashboard-section-store";

beforeEach(() => {
  _resetDashboardSectionsForTests();
});

describe("dashboard-section-store", () => {
  it("returns the default when no value is recorded", () => {
    expect(readSectionCollapsed("foo", false)).toBe(false);
    expect(readSectionCollapsed("foo", true)).toBe(true);
  });

  it("round-trips a toggle", () => {
    writeSectionCollapsed("insights", true);
    expect(readSectionCollapsed("insights", false)).toBe(true);
    writeSectionCollapsed("insights", false);
    expect(readSectionCollapsed("insights", true)).toBe(false);
  });

  it("keys are independent", () => {
    writeSectionCollapsed("a", true);
    writeSectionCollapsed("b", false);
    expect(readSectionCollapsed("a", false)).toBe(true);
    expect(readSectionCollapsed("b", true)).toBe(false);
  });

  it("explicit false overrides defaultCollapsed=true", () => {
    writeSectionCollapsed("recap", false);
    expect(readSectionCollapsed("recap", true)).toBe(false);
  });

  it("reset clears every recorded value", () => {
    writeSectionCollapsed("a", true);
    _resetDashboardSectionsForTests();
    expect(readSectionCollapsed("a", false)).toBe(false);
  });

  it("does NOT persist across module / page reloads", () => {
    // The store now lives entirely in module-scoped memory. We simulate
    // a cold start by importing a fresh URL-suffixed copy.
    writeSectionCollapsed("survives", true);
    const fresh = import(
      "@/lib/dashboard-section-store?fresh=" + Date.now()
    ) as Promise<typeof import("@/lib/dashboard-section-store")>;
    return fresh.then((mod) => {
      expect(mod.readSectionCollapsed("survives", false)).toBe(false);
    });
  });

  it("resetAllCollapseState wipes the whole map", () => {
    writeSectionCollapsed("x", true);
    writeSectionCollapsed("y", true);
    expect(resetAllCollapseState()).toBe(true);
    expect(readSectionCollapsed("x", false)).toBe(false);
    expect(readSectionCollapsed("y", false)).toBe(false);
    // Second call: map is already empty → returns false.
    expect(resetAllCollapseState()).toBe(false);
  });

  it("subscribeCollapseState notifies on write + reset", () => {
    let n = 0;
    const unsub = subscribeCollapseState(() => {
      n += 1;
    });
    writeSectionCollapsed("z", true);
    writeSectionCollapsed("z", false);
    resetAllCollapseState();
    unsub();
    writeSectionCollapsed("z", true); // ignored after unsub
    expect(n).toBe(3);
  });
});
