import { describe, expect, it } from "vitest";

import { incomeForecast } from "@/lib/income-forecast";
import type { ExpenseEntry, Income } from "@/types/finance";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function income(amount: number, active = true): Income {
  return {
    id: `inc-${amount}-${active ? "a" : "i"}`,
    label: `Income ${amount}`,
    amount,
    dayOfMonth: 1,
    active,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function refundEntry(amount: number, monthIdx0: number, day = 10): ExpenseEntry {
  const date = new Date(2026, monthIdx0, day).toISOString();
  return {
    id: `ref-${monthIdx0}-${amount}`,
    amount,
    installments: 1,
    chargeDate: date,
    paymentMethod: "credit",
    category: "food",
    source: "manual",
    isRefund: true,
    createdAt: date,
  };
}

describe("incomeForecast", () => {
  it("returns zero across the board on an empty input", () => {
    const f = incomeForecast({ incomes: [], entries: [], now: NOW });
    expect(f.scheduledMonthly).toBe(0);
    expect(f.irregularMonthly).toBe(0);
    expect(f.expectedTotal).toBe(0);
    expect(f.confidence).toBe("low");
  });

  it("scheduled-only with no history → high confidence after defaults", () => {
    const f = incomeForecast({
      incomes: [income(12000)],
      entries: [],
      now: NOW,
    });
    expect(f.scheduledMonthly).toBe(12000);
    expect(f.irregularMonthly).toBe(0);
    expect(f.expectedTotal).toBe(12000);
    expect(f.confidence).toBe("high");
  });

  it("inactive incomes are excluded", () => {
    const f = incomeForecast({
      incomes: [income(8000), income(4000, false)],
      entries: [],
      now: NOW,
    });
    expect(f.scheduledMonthly).toBe(8000);
  });

  it("averages refund credits across the lookback window", () => {
    const f = incomeForecast({
      incomes: [income(10000)],
      entries: [
        refundEntry(300, 1), // Feb
        refundEntry(300, 2), // Mar
        refundEntry(300, 3), // Apr
      ],
      now: NOW,
      lookbackMonths: 3,
    });
    expect(f.irregularMonthly).toBe(300);
    expect(f.expectedTotal).toBe(10300);
    expect(f.confidence).toBe("medium");
  });

  it("next month mirrors the current shape", () => {
    const f = incomeForecast({
      incomes: [income(10000)],
      entries: [],
      now: NOW,
    });
    expect(f.nextMonth.monthKey).toBe("2026-06");
    expect(f.nextMonth.expectedTotal).toBe(10000);
  });

  it("ignores refund entries flagged needsConfirmation / pending", () => {
    const dirty: ExpenseEntry = {
      ...refundEntry(500, 3),
      needsConfirmation: true,
    };
    const f = incomeForecast({
      incomes: [],
      entries: [dirty],
      now: NOW,
    });
    expect(f.irregularMonthly).toBe(0);
  });

  it("irregular-only is low confidence", () => {
    const f = incomeForecast({
      incomes: [],
      entries: [refundEntry(500, 3)],
      now: NOW,
    });
    expect(f.confidence).toBe("low");
  });
});
