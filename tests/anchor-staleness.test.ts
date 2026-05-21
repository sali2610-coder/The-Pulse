import { describe, expect, it } from "vitest";

import { detectStaleAnchors } from "@/lib/anchor-staleness";
import type { Account } from "@/types/finance";

const NOW = new Date(2026, 4, 20, 12, 0);

function bank(overrides: Partial<Account> = {}): Account {
  return {
    id: "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-01T00:00:00.000Z",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("detectStaleAnchors", () => {
  it("returns empty when no banks are stale", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({ anchorUpdatedAt: new Date(2026, 4, 19).toISOString() }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(0);
  });

  it("flags a 15-day-old anchor as watch", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({
          anchorUpdatedAt: new Date(2026, 4, 5).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(1);
    expect(stale[0].severity).toBe("watch");
    expect(stale[0].daysSinceUpdate).toBe(15);
  });

  it("flags a 35-day-old anchor as alert", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({
          anchorUpdatedAt: new Date(2026, 3, 15).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(1);
    expect(stale[0].severity).toBe("alert");
  });

  it("skips card accounts", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({
          kind: "card",
          anchorUpdatedAt: new Date(2026, 3, 1).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(0);
  });

  it("skips inactive banks", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({
          active: false,
          anchorUpdatedAt: new Date(2026, 3, 1).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(0);
  });

  it("skips banks without anchorBalance or anchorUpdatedAt", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({ anchorBalance: undefined }),
        bank({ id: "b2", anchorUpdatedAt: undefined }),
      ],
      now: NOW,
    });
    expect(stale).toHaveLength(0);
  });

  it("sorts most stale first", () => {
    const stale = detectStaleAnchors({
      accounts: [
        bank({
          id: "recent",
          anchorUpdatedAt: new Date(2026, 4, 5).toISOString(),
        }),
        bank({
          id: "ancient",
          anchorUpdatedAt: new Date(2026, 2, 1).toISOString(),
        }),
      ],
      now: NOW,
    });
    expect(stale[0].accountId).toBe("ancient");
    expect(stale[1].accountId).toBe("recent");
  });
});
