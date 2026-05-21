import { beforeEach, describe, expect, it } from "vitest";

import {
  clearInsightDismissals,
  dismissInsight,
  isInsightDismissed,
  pruneExpiredDismissals,
} from "@/lib/insight-dismiss";

beforeEach(() => {
  clearInsightDismissals();
});

describe("insight-dismiss", () => {
  it("persists a dismissal across calls", () => {
    expect(isInsightDismissed("subscription", "netflix")).toBe(false);
    dismissInsight("subscription", "netflix");
    expect(isInsightDismissed("subscription", "netflix")).toBe(true);
  });

  it("isolates dismissals across detector kinds", () => {
    dismissInsight("subscription", "abc");
    expect(isInsightDismissed("rule-drift", "abc")).toBe(false);
  });

  it("expires a dismissal after 7 days", () => {
    const past = Date.now() - 8 * 24 * 60 * 60 * 1000;
    dismissInsight("dormant-rule", "old-gym", past);
    expect(isInsightDismissed("dormant-rule", "old-gym")).toBe(false);
  });

  it("keeps a 6-day-old dismissal alive", () => {
    const past = Date.now() - 6 * 24 * 60 * 60 * 1000;
    dismissInsight("budget-recommendation", "x", past);
    expect(isInsightDismissed("budget-recommendation", "x")).toBe(true);
  });

  it("prunes expired entries on demand", () => {
    const past = Date.now() - 30 * 24 * 60 * 60 * 1000;
    dismissInsight("stale-anchor", "bank-1", past);
    dismissInsight("stale-anchor", "bank-2");
    pruneExpiredDismissals();
    expect(isInsightDismissed("stale-anchor", "bank-1")).toBe(false);
    expect(isInsightDismissed("stale-anchor", "bank-2")).toBe(true);
  });

  it("ignores empty target ids", () => {
    dismissInsight("subscription", "");
    expect(isInsightDismissed("subscription", "")).toBe(false);
  });
});
