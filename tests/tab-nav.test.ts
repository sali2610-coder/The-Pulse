import { describe, expect, it } from "vitest";

import {
  isTabId,
  navigateToTab,
  subscribeTabNav,
  tabFromHash,
} from "@/lib/tab-nav";

describe("tab-nav", () => {
  it("validates known tab ids", () => {
    expect(isTabId("dashboard")).toBe(true);
    expect(isTabId("settings")).toBe(true);
    expect(isTabId("random")).toBe(false);
    expect(isTabId("")).toBe(false);
  });

  it("parses tabFromHash", () => {
    expect(tabFromHash("#settings")).toBe("settings");
    expect(tabFromHash("settings")).toBe("settings");
    expect(tabFromHash("")).toBeNull();
    expect(tabFromHash("#bogus")).toBeNull();
  });

  it("delivers navigate events to subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeTabNav((tab) => seen.push(tab));
    navigateToTab("settings");
    navigateToTab("history");
    unsub();
    navigateToTab("dashboard");
    expect(seen).toEqual(["settings", "history"]);
  });

  it("rejects invalid tab payloads", () => {
    const seen: string[] = [];
    const unsub = subscribeTabNav((tab) => seen.push(tab));
    window.dispatchEvent(
      new CustomEvent("sally:nav-tab", { detail: "bogus" as never }),
    );
    expect(seen).toEqual([]);
    unsub();
  });
});
