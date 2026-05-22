import { describe, expect, it } from "vitest";

import { entriesToCsv } from "@/lib/csv-export";
import type { ExpenseEntry } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? "e1",
    amount: 100,
    category: "food",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    ...o,
  };
}

describe("entriesToCsv", () => {
  it("emits a header row + trailing newline", () => {
    const csv = entriesToCsv([]);
    expect(csv.startsWith("id,chargeDate,amount,")).toBe(true);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("renders a basic row", () => {
    const csv = entriesToCsv([entry({ id: "e1", amount: 250 })]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    const fields = lines[1].split(",");
    expect(fields[0]).toBe("e1");
    expect(fields[2]).toBe("250");
    expect(fields[3]).toBe("food");
  });

  it("escapes commas + quotes + newlines per RFC 4180", () => {
    const csv = entriesToCsv([
      entry({
        id: "e1",
        merchant: 'שופרסל, סניף "12"\nשורה שנייה',
      }),
    ]);
    // Merchant field is the 7th column (index 6).
    const second = csv.split("\n")[1];
    // RFC 4180 wraps the field in quotes; embedded quotes doubled.
    expect(second).toContain(`"שופרסל, סניף ""12""`);
  });

  it("sorts chronologically by chargeDate ASC then createdAt ASC", () => {
    const csv = entriesToCsv([
      entry({ id: "late", chargeDate: "2026-05-20T12:00:00.000Z" }),
      entry({ id: "early", chargeDate: "2026-05-01T12:00:00.000Z" }),
      entry({
        id: "midSameDay",
        chargeDate: "2026-05-10T12:00:00.000Z",
        createdAt: "2026-05-10T09:00:00.000Z",
      }),
      entry({
        id: "midLater",
        chargeDate: "2026-05-10T12:00:00.000Z",
        createdAt: "2026-05-10T14:00:00.000Z",
      }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1].split(",")[0]).toBe("early");
    expect(lines[2].split(",")[0]).toBe("midSameDay");
    expect(lines[3].split(",")[0]).toBe("midLater");
    expect(lines[4].split(",")[0]).toBe("late");
  });

  it("optional fields render as empty strings", () => {
    const csv = entriesToCsv([entry({ id: "x" })]);
    const fields = csv.split("\n")[1].split(",");
    // merchant + issuer + cardLast4 + accountId + externalId +
    // matchedRuleId + currency + confirmedAt + note → all empty.
    expect(fields[6]).toBe(""); // merchant
    expect(fields[7]).toBe(""); // issuer
    expect(fields[8]).toBe(""); // cardLast4
    expect(fields[19]).toBe(""); // note
  });

  it("boolean flags render as 'true' or empty", () => {
    const csv = entriesToCsv([
      entry({ id: "ref", isRefund: true, bankPending: true }),
    ]);
    const fields = csv.split("\n")[1].split(",");
    expect(fields[13]).toBe("true"); // isRefund
    expect(fields[15]).toBe("true"); // bankPending
    expect(fields[16]).toBe(""); // needsConfirmation absent
  });
});
