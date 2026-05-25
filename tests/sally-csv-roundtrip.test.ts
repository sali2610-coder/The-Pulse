import { describe, expect, it } from "vitest";

import { entriesToCsv } from "@/lib/csv-export";
import { parseSallyCsv } from "@/lib/sally-csv-import";
import { parseCsvRows } from "@/lib/csv-parse-rows";
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

describe("parseCsvRows", () => {
  it("handles embedded newlines inside quoted fields", () => {
    const text = `a,b\n"line\n1","ok"\n`;
    const rows = parseCsvRows(text);
    expect(rows).toEqual([
      ["a", "b"],
      ["line\n1", "ok"],
    ]);
  });

  it("doubles up embedded quotes per RFC 4180", () => {
    const text = `merchant\n"He said ""hi"""`;
    const rows = parseCsvRows(text);
    expect(rows).toEqual([["merchant"], [`He said "hi"`]]);
  });

  it("treats CRLF and LF as equivalent row boundaries", () => {
    const text = "a,b\r\n1,2\n3,4\r\n";
    expect(parseCsvRows(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseSallyCsv — error paths", () => {
  it("rejects an empty file", () => {
    const res = parseSallyCsv("");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("empty_file");
  });

  it("rejects when required header is missing", () => {
    const res = parseSallyCsv("id,amount\n1,100\n");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("missing_required_header");
      expect(res.detail).toContain("chargeDate");
    }
  });

  it("warns about unknown category rows but keeps parsing the rest", () => {
    const header =
      "id,chargeDate,amount,category,paymentMethod,installments,merchant,issuer,cardLast4,accountId,source,externalId,matchedRuleId,isRefund,currency,bankPending,needsConfirmation,confirmedAt,excludeFromBudget,note,createdAt";
    const good =
      "g,2026-05-10T12:00:00.000Z,100,food,credit,1,,,,,manual,,,,,,,,,,2026-05-10";
    const bad =
      "b,2026-05-10T12:00:00.000Z,100,zzzzzz,credit,1,,,,,manual,,,,,,,,,,2026-05-10";
    const res = parseSallyCsv(`${header}\n${good}\n${bad}\n`);
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows).toHaveLength(1);
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain("zzzzzz");
  });
});

describe("Sally CSV roundtrip", () => {
  it("export → parse preserves every field on a representative row", () => {
    const e = entry({
      id: "abc",
      amount: 142.9,
      category: "food",
      merchant: 'שופרסל, סניף "12"',
      paymentMethod: "credit",
      installments: 3,
      source: "manual",
      externalId: "ext-xyz",
      issuer: "cal",
      cardLast4: "1234",
      note: "line A\nline B",
    });
    const csv = entriesToCsv([e]);
    const res = parseSallyCsv(csv);
    if (!res.ok) throw new Error("expected ok parse");
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.amount).toBe(142.9);
    expect(row.category).toBe("food");
    expect(row.merchant).toBe('שופרסל, סניף "12"');
    expect(row.installments).toBe(3);
    expect(row.paymentMethod).toBe("credit");
    expect(row.externalId).toBe("ext-xyz");
    expect(row.issuer).toBe("cal");
    expect(row.cardLast4).toBe("1234");
    expect(row.note).toBe("line A\nline B");
  });

  it("synthesizes a deterministic externalId when missing", () => {
    const csv = [
      "id,chargeDate,amount,category,paymentMethod,installments,merchant,issuer,cardLast4,accountId,source,externalId,matchedRuleId,isRefund,currency,bankPending,needsConfirmation,confirmedAt,excludeFromBudget,note,createdAt",
      "x,2026-05-10T12:00:00.000Z,50,food,cash,1,Cafe,,,,manual,,,,,,,,,,2026-05-10",
    ].join("\n");
    const res = parseSallyCsv(csv);
    if (!res.ok) throw new Error("ok");
    const id = res.rows[0].externalId;
    expect(id).toBe("import:sally:manual:2026-05-10T12:00:00.000Z:50.00:Cafe");
    // Re-parse the same file → identical id → store dedup would short-circuit.
    const res2 = parseSallyCsv(csv);
    if (!res2.ok) throw new Error("ok");
    expect(res2.rows[0].externalId).toBe(id);
  });

  it("preserves boolean flags when set to 'true'", () => {
    const csv = [
      "id,chargeDate,amount,category,paymentMethod,installments,merchant,issuer,cardLast4,accountId,source,externalId,matchedRuleId,isRefund,currency,bankPending,needsConfirmation,confirmedAt,excludeFromBudget,note,createdAt",
      "x,2026-05-10T12:00:00.000Z,50,food,cash,1,Cafe,,,,manual,e1,,,,true,true,,,,2026-05-10",
    ].join("\n");
    const res = parseSallyCsv(csv);
    if (!res.ok) throw new Error("ok");
    expect(res.rows[0].bankPending).toBe(true);
    expect(res.rows[0].needsConfirmation).toBe(true);
  });
});
