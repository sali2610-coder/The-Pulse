// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  readSectionCollapsed,
  writeSectionCollapsed,
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
});
