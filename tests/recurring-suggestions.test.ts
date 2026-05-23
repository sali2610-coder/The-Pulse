import { describe, expect, it } from "vitest";

import { detectRecurringSuggestions } from "@/lib/recurring-suggestions";
import type {
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const NOW = new Date(2026, 4, 15, 12, 0, 0); // May 15 2026

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    category: "entertainment",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    createdAt: new Date(2026, 4, 10, 12, 0, 0).toISOString(),
    merchant: "Netflix",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: o.label ?? "Netflix",
    category: "entertainment",
    estimatedAmount: 50,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("detectRecurringSuggestions", () => {
  it("empty entries → no suggestions", () => {
    const s = detectRecurringSuggestions({
      entries: [],
      rules: [],
      end: NOW,
    });
    expect(s).toEqual([]);
  });

  it("suggests Netflix when 3 consecutive months match within ±15%", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({
          chargeDate: new Date(2026, 2, 10).toISOString(),
          amount: 49.9,
        }),
        entry({
          chargeDate: new Date(2026, 3, 10).toISOString(),
          amount: 50,
        }),
        entry({
          chargeDate: new Date(2026, 4, 10).toISOString(),
          amount: 50.1,
        }),
      ],
      rules: [],
      end: NOW,
    });
    expect(s).toHaveLength(1);
    expect(s[0].label).toBe("Netflix");
    expect(s[0].estimatedAmount).toBeCloseTo(50, 5);
    expect(s[0].observedMonths).toBe(3);
    expect(s[0].dayOfMonth).toBe(10);
  });

  it("skips merchants already promoted (rule label or keyword)", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({ chargeDate: new Date(2026, 2, 10).toISOString() }),
        entry({ chargeDate: new Date(2026, 3, 10).toISOString() }),
        entry({ chargeDate: new Date(2026, 4, 10).toISOString() }),
      ],
      rules: [rule({ label: "Netflix" })],
      end: NOW,
    });
    expect(s).toEqual([]);
  });

  it("rejects merchants with high amount variance", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({
          chargeDate: new Date(2026, 2, 10).toISOString(),
          amount: 30,
        }),
        entry({
          chargeDate: new Date(2026, 3, 10).toISOString(),
          amount: 80,
        }),
        entry({
          chargeDate: new Date(2026, 4, 10).toISOString(),
          amount: 200,
        }),
      ],
      rules: [],
      end: NOW,
    });
    expect(s).toEqual([]);
  });

  it("requires at least minMonths distinct months", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({ chargeDate: new Date(2026, 4, 10).toISOString() }),
        entry({ chargeDate: new Date(2026, 4, 11).toISOString() }),
        // Only May — not enough.
      ],
      rules: [],
      end: NOW,
      minMonths: 3,
    });
    expect(s).toEqual([]);
  });

  it("excludes noisy entries (refund / pending / non-ILS)", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({
          chargeDate: new Date(2026, 2, 10).toISOString(),
          isRefund: true,
        }),
        entry({
          chargeDate: new Date(2026, 3, 10).toISOString(),
          bankPending: true,
        }),
        entry({
          chargeDate: new Date(2026, 4, 10).toISOString(),
          currency: "USD",
        }),
      ],
      rules: [],
      end: NOW,
    });
    expect(s).toEqual([]);
  });

  it("normalises merchant variants via merchantKey", () => {
    const s = detectRecurringSuggestions({
      entries: [
        entry({
          merchant: "Netflix.com",
          chargeDate: new Date(2026, 2, 10).toISOString(),
        }),
        entry({
          merchant: "Netflix",
          chargeDate: new Date(2026, 3, 10).toISOString(),
        }),
        entry({
          merchant: "Netflix Subscription",
          chargeDate: new Date(2026, 4, 10).toISOString(),
        }),
      ],
      rules: [],
      end: NOW,
    });
    expect(s).toHaveLength(1);
    expect(s[0].observedMonths).toBe(3);
  });

  it("sorts by observedMonths DESC then estimatedAmount DESC", () => {
    const s = detectRecurringSuggestions({
      entries: [
        // Apple: 4 months, 9.90
        ...[1, 2, 3, 4].map((m) =>
          entry({
            merchant: "Apple",
            amount: 9.9,
            chargeDate: new Date(2026, m, 5).toISOString(),
          }),
        ),
        // Spotify: 3 months, 20.00
        ...[2, 3, 4].map((m) =>
          entry({
            merchant: "Spotify",
            amount: 20,
            chargeDate: new Date(2026, m, 5).toISOString(),
          }),
        ),
        // Cellcom: 3 months, 100.00
        ...[2, 3, 4].map((m) =>
          entry({
            merchant: "Cellcom",
            amount: 100,
            chargeDate: new Date(2026, m, 5).toISOString(),
          }),
        ),
      ],
      rules: [],
      end: NOW,
    });
    // sanitize.ts canonicalises "Cellcom" → "סלקום" via the BRANDS
    // table. Both labels collapse to the canonical form.
    expect(s.map((x) => x.label)).toEqual(["Apple", "סלקום", "Spotify"]);
  });
});
