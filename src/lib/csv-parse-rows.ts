// Phase 224 — RFC 4180 CSV row tokenizer.
//
// Statement-csv ships a single-line splitter; Sally's own export
// quotes fields that contain newlines, so the importer needs a
// stateful tokenizer that walks the full file. Keeps the parser
// honest about: doubled-quote escapes, CRLF + LF line endings, and
// trailing newlines.
//
// Pure. No dependencies. Returns string[][] where the first inner
// array is the header row (caller decides what to do with it).

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      // Treat CRLF as one boundary.
      i++;
      row.push(cur);
      rows.push(row);
      cur = "";
      row = [];
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cur);
      rows.push(row);
      cur = "";
      row = [];
      continue;
    }
    cur += ch;
  }

  // Flush a trailing partial row. Skip a phantom empty row that comes
  // from a trailing newline at end-of-file.
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (!(row.length === 1 && row[0] === "")) {
      rows.push(row);
    }
  }
  return rows;
}
