import { describe, expect, it } from "vitest";

import { detectStalePending } from "@/lib/stale-pending";
import type { ExpenseEntry } from "@/types/finance";

const NOW = new Date(2026, 4, 20, 12, 0);

function entry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 100,
    category: "food",
    source: "wallet",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 5).toISOString(),
    createdAt: new Date(2026, 4, 5).toISOString(),
    needsConfirmation: true,
    ...overrides,
  };
}

describe("detectStalePending", () => {
  it("returns empty when no entries are pending", () => {
    expect(
      detectStalePending({
        entries: [entry({ needsConfirmation: false })],
        now: NOW,
      }),
    ).toHaveLength(0);
  });

  it("ignores fresh pending entries", () => {
    const fresh = entry({
      createdAt: new Date(2026, 4, 19).toISOString(),
    });
    expect(detectStalePending({ entries: [fresh], now: NOW })).toHaveLength(0);
  });

  it("flags pending entries older than the threshold", () => {
    const stale = entry({
      createdAt: new Date(2026, 4, 10).toISOString(),
    });
    const out = detectStalePending({ entries: [stale], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].daysOld).toBe(10);
  });

  it("skips entries that already have confirmedAt set", () => {
    const confirmed = entry({
      createdAt: new Date(2026, 4, 10).toISOString(),
      confirmedAt: new Date(2026, 4, 11).toISOString(),
    });
    expect(
      detectStalePending({ entries: [confirmed], now: NOW }),
    ).toHaveLength(0);
  });

  it("sorts by daysOld desc", () => {
    const entries = [
      entry({
        id: "old",
        createdAt: new Date(2026, 3, 1).toISOString(),
      }),
      entry({
        id: "newer",
        createdAt: new Date(2026, 4, 14).toISOString(),
      }),
    ];
    const out = detectStalePending({ entries, now: NOW });
    expect(out[0].entryId).toBe("old");
  });
});
