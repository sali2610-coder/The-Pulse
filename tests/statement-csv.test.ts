import { describe, expect, it } from "vitest";
import { parseStatementCsv } from "@/lib/parsers/statement-csv";

describe("parseStatementCsv", () => {
  it("parses a Hebrew header CSV", () => {
    const csv = `תאריך עסקה,שם בית עסק,סכום חיוב,4 ספרות אחרונות
03/05/2026,שופרסל,150.50,1234
04/05/2026,דלק,200,5678`;
    const r = parseStatementCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].amount).toBe(150.5);
    expect(r.rows[0].merchant).toBe("שופרסל");
    expect(r.rows[0].cardLast4).toBe("1234");
    expect(r.rows[0].date.startsWith("2026-05-03")).toBe(true);
  });

  it("parses an English header CSV", () => {
    const csv = `Date,Merchant,Amount
2026-05-03,Coffee Shop,12.50
2026-05-04,Gas Station,200.00`;
    const r = parseStatementCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].amount).toBe(12.5);
  });

  it("skips preamble lines and locates the header row", () => {
    const csv = `דוח חיובים — מאי 2026
לקוח: 1234
,,,
תאריך,בית עסק,סכום חיוב
01/05/26,מכולת,45.30`;
    const r = parseStatementCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].merchant).toBe("מכולת");
  });

  it("skips rows missing required fields", () => {
    const csv = `Date,Merchant,Amount
2026-05-03,,150
,Shop,250
2026-05-04,Real,99`;
    const r = parseStatementCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("rejects when required columns are missing", () => {
    const csv = `Foo,Bar,Baz
1,2,3`;
    const r = parseStatementCsv(csv);
    expect(r.ok).toBe(false);
  });
});
