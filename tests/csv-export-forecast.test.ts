import { describe, expect, it } from "vitest";

import {
  bucketsToCsv,
  curveToCsv,
} from "@/lib/csv-export-forecast";
import type { CashFlowBucketsReport } from "@/lib/cash-flow-bucket";
import type { LiquidityCurve } from "@/lib/liquidity-curve";

function makeBucketsReport(): CashFlowBucketsReport {
  return {
    windowStart: "2026-05-25T00:00:00.000Z",
    windowEnd: "2026-06-29T00:00:00.000Z",
    totalCommitted: 1700,
    buckets: [
      {
        id: "card:c1",
        label: "Isracard",
        source: "card",
        monthlyTotal: 1500,
        nextSettlementAt: "2026-06-10T00:00:00.000Z",
        obligationCount: 2,
        cardId: "c1",
        cardLast4: "1234",
        obligations: [
          {
            label: 'שופרסל, סניף "12"',
            amount: 700,
            effectiveCashAt: "2026-06-10T00:00:00.000Z",
            kind: "card_entry",
            refId: "e1",
          },
          {
            label: "ביטוח חיים",
            amount: 800,
            effectiveCashAt: "2026-06-10T00:00:00.000Z",
            kind: "recurring",
            refId: "r1",
          },
        ],
      },
      {
        id: "loan:l1",
        label: "הלוואה משכנתא",
        source: "loan",
        monthlyTotal: 200,
        nextSettlementAt: "2026-05-28T00:00:00.000Z",
        obligationCount: 1,
        loanId: "l1",
        obligations: [
          {
            label: "הלוואה משכנתא",
            amount: 200,
            effectiveCashAt: "2026-05-28T00:00:00.000Z",
            kind: "loan",
            refId: "l1",
          },
        ],
      },
    ],
  };
}

function makeCurve(): LiquidityCurve {
  const p0 = {
    dayIndex: 0,
    whenISO: "2026-05-25T00:00:00.000Z",
    balance: 5000,
    delta: 0,
    events: [],
  };
  const p1 = {
    dayIndex: 1,
    whenISO: "2026-05-26T00:00:00.000Z",
    balance: 4500,
    delta: -500,
    events: [
      {
        kind: "card" as const,
        label: 'שופרסל, סניף "12"',
        amount: -500,
        whenISO: "2026-05-26T00:00:00.000Z",
      },
    ],
  };
  return {
    points: [p0, p1],
    startingBalance: 5000,
    windowDays: 2,
    lowestPoint: p1,
    highestPoint: p0,
    crossesZero: false,
    crossesNegative: false,
    nextSalaryAt: null,
    balanceAtNextSalary: null,
    totalInflow: 0,
    totalOutflow: 500,
  };
}

describe("bucketsToCsv", () => {
  it("emits header + one row per obligation + trailing newline", () => {
    const csv = bucketsToCsv(makeBucketsReport());
    const lines = csv.split("\n");
    expect(lines[0].startsWith("bucket_id,bucket_label,source,")).toBe(true);
    // 1 header + 2 card obligations + 1 loan obligation + trailing empty.
    expect(lines).toHaveLength(5);
    expect(lines.at(-1)).toBe("");
  });

  it("quotes merchant labels with commas + embedded double quotes per RFC 4180", () => {
    const csv = bucketsToCsv(makeBucketsReport());
    expect(csv).toContain(`"שופרסל, סניף ""12"""`);
  });

  it("preserves source + cardLast4 + amount in stable column order", () => {
    const csv = bucketsToCsv(makeBucketsReport());
    // Use the 2nd obligation row — no commas inside, so naive split is safe.
    const fields = csv.split("\n")[2].split(",");
    expect(fields[2]).toBe("card");
    expect(fields[3]).toBe("1234");
    expect(fields[4]).toBe("ביטוח חיים");
    expect(fields[5]).toBe("recurring");
    expect(fields[6]).toBe("800");
  });
});

describe("curveToCsv", () => {
  it("emits header + one row per LiquidityPoint", () => {
    const csv = curveToCsv(makeCurve());
    const lines = csv.split("\n");
    expect(lines[0]).toBe("day_index,when_iso,balance_ils,delta_ils,events");
    expect(lines).toHaveLength(4); // header + 2 points + trailing empty
  });

  it("joins multi-event days into a single quoted cell", () => {
    const csv = curveToCsv(makeCurve());
    // The second data line carries a label with comma + quotes — must be RFC-quoted.
    const second = csv.split("\n")[2];
    expect(second).toContain(`"card:שופרסל, סניף ""12"":-500"`);
  });

  it("encodes positive events with a leading +", () => {
    const c = makeCurve();
    c.points[1].events[0] = {
      kind: "income",
      label: "Salary",
      amount: 12000,
      whenISO: "2026-05-26T00:00:00.000Z",
    };
    const csv = curveToCsv(c);
    expect(csv).toContain("income:Salary:+12000");
  });
});
