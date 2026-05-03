// Generic CSV statement parser. CAL/MAX/Isracard portal exports vary in
// column order, header names, and locale, but they share the same shape:
// row = { date, amount, merchant, cardLast4? }. We auto-detect headers
// using a tolerant matcher; specialized per-issuer parsers can override
// when the user provides a real export sample.

import type { Issuer } from "@/types/finance";

export type StatementRow = {
  date: string; // ISO
  amount: number;
  merchant: string;
  cardLast4?: string;
  raw: Record<string, string>;
};

export type StatementParseResult =
  | { ok: true; rows: StatementRow[]; warnings: string[] }
  | { ok: false; reason: string; details?: string };

const HEADER_ALIASES: Record<keyof StatementRow | "ignore", RegExp[]> = {
  date: [
    /תאריך\s*(עסקה|רכישה)?/i,
    /^date$/i,
    /transaction\s*date/i,
    /posting\s*date/i,
  ],
  amount: [
    /^סכום(\s*חיוב)?$/i,
    /סכום\s*בש"?ח/i,
    /^amount$/i,
    /charged\s*amount/i,
  ],
  merchant: [
    /^שם\s*(בית\s*עסק|העסק)$/i,
    /בית\s*עסק/i,
    /^merchant$/i,
    /description/i,
  ],
  cardLast4: [/^4\s*ספרות/i, /card\s*last\s*4/i, /כרטיס/i],
  raw: [],
  ignore: [/^$/],
};

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  // Statements typically report charges as positive; refunds negative. We
  // keep absolute value for consistency with the manual entry flow.
  return Math.abs(num);
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Common Israeli formats: DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY.
  const m = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) {
    const direct = new Date(raw);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

function findColumn(
  headers: string[],
  field: keyof StatementRow,
): number | null {
  const aliases = HEADER_ALIASES[field];
  if (!aliases) return null;
  for (let i = 0; i < headers.length; i++) {
    if (aliases.some((re) => re.test(headers[i]))) return i;
  }
  return null;
}

// `issuer` is currently a hint for future per-issuer overrides (e.g. CAL's
// statement uses negative amounts for refunds, MAX truncates merchant strings).
// Today we use the generic flow for both, but the param is kept so the call
// sites and tests don't shift when the dispatch lands.
export function parseStatementCsv(
  csv: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  issuer?: Issuer,
): StatementParseResult {
  const lines = csv
    .replace(/﻿/g, "") // strip BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { ok: false, reason: "csv_too_short" };
  }

  // Heuristic: skip preamble lines until we find a header row that
  // contains at least "תאריך" or "date".
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (/תאריך|^date/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCSVLine(lines[headerIdx]);
  const dateCol = findColumn(headers, "date");
  const amountCol = findColumn(headers, "amount");
  const merchantCol = findColumn(headers, "merchant");
  const cardCol = findColumn(headers, "cardLast4");

  if (dateCol === null || amountCol === null || merchantCol === null) {
    return {
      ok: false,
      reason: "missing_required_columns",
      details: `headers seen: ${headers.join(", ")}`,
    };
  }

  const rows: StatementRow[] = [];
  const warnings: string[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const dateIso = parseDate(cells[dateCol] ?? "");
    const amount = parseAmount(cells[amountCol] ?? "");
    const merchant = (cells[merchantCol] ?? "").trim();

    if (!dateIso || amount === null || amount === 0 || !merchant) {
      warnings.push(`row ${i + 1}: skipped (incomplete)`);
      continue;
    }

    const cardLast4 =
      cardCol !== null
        ? (cells[cardCol] ?? "").replace(/\D/g, "").slice(-4) || undefined
        : undefined;

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? "";
    });

    rows.push({ date: dateIso, amount, merchant, cardLast4, raw });
  }

  return { ok: true, rows, warnings };
}
