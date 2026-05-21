import { describe, expect, it } from "vitest";

import { detectIncompleteCards } from "@/lib/incomplete-cards";
import type { Account } from "@/types/finance";

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: "card-1",
    kind: "card",
    label: "CAL",
    issuer: "cal",
    cardLast4: "1234",
    billingDay: 25,
    paymentDay: 2,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("detectIncompleteCards", () => {
  it("returns empty when all cards have both days", () => {
    expect(detectIncompleteCards({ accounts: [card()] })).toHaveLength(0);
  });

  it("flags cards missing billingDay", () => {
    const incomplete = detectIncompleteCards({
      accounts: [card({ billingDay: undefined })],
    });
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].missingBillingDay).toBe(true);
    expect(incomplete[0].missingPaymentDay).toBe(false);
  });

  it("flags cards missing paymentDay", () => {
    const incomplete = detectIncompleteCards({
      accounts: [card({ paymentDay: undefined })],
    });
    expect(incomplete[0].missingPaymentDay).toBe(true);
  });

  it("flags cards missing both days", () => {
    const incomplete = detectIncompleteCards({
      accounts: [
        card({ billingDay: undefined, paymentDay: undefined }),
      ],
    });
    expect(incomplete[0].missingBillingDay).toBe(true);
    expect(incomplete[0].missingPaymentDay).toBe(true);
  });

  it("skips non-card accounts and inactive cards", () => {
    const incomplete = detectIncompleteCards({
      accounts: [
        card({ kind: "bank", billingDay: undefined }),
        card({ id: "off", billingDay: undefined, active: false }),
      ],
    });
    expect(incomplete).toHaveLength(0);
  });
});
