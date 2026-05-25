"use client";

// Phase 224 — re-import a CSV that this app previously exported.
//
// The export side (csv-export.ts, csv-export-forecast.ts) is the
// canonical archive of the user's data. This card hydrates state
// from such a file: useful after a hard reset, a device move, or a
// long offline window during which the cloud backup got purged.
//
// Idempotent. Re-importing the same file is a no-op because the
// store's externalId dedup short-circuits each row on the second
// pass.

import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import {
  parseSallyCsv,
  type SallyImportRow,
} from "@/lib/sally-csv-import";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap

export function SallyCsvImportCard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SallyImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<{
    added: number;
    skipped: number;
  } | null>(null);

  const addExpense = useFinanceStore((s) => s.addExpense);

  async function handleFile(file: File) {
    setError(null);
    setWarnings([]);
    setRows([]);
    setImported(null);

    if (file.size > MAX_FILE_BYTES) {
      setError("הקובץ גדול מהמותר (2 MB).");
      return;
    }
    const text = await file.text();
    const res = parseSallyCsv(text);
    if (!res.ok) {
      setError(
        res.reason === "missing_required_header"
          ? `חסרות עמודות חובה: ${res.detail}`
          : res.reason === "empty_file"
            ? "קובץ ריק."
            : "אין שורות נתונים.",
      );
      return;
    }
    setRows(res.rows);
    setWarnings(res.warnings);
  }

  function runImport() {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      let added = 0;
      let skipped = 0;
      for (const r of rows) {
        const out = addExpense({
          amount: r.amount,
          category: r.category,
          installments: r.installments,
          paymentMethod: r.paymentMethod,
          chargeDate: r.chargeDate,
          source: r.source,
          externalId: r.externalId,
          issuer: r.issuer,
          cardLast4: r.cardLast4,
          accountId: r.accountId,
          merchant: r.merchant,
          note: r.note,
          bankPending: r.bankPending,
          needsConfirmation: r.needsConfirmation,
        });
        if (out.duplicate) skipped++;
        else added++;
      }
      setImported({ added, skipped });
      toast.success(`יובאו ${added} · דילוג על כפילות ${skipped}`);
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
          <Upload className="size-3 text-[color:var(--neon)]" />
          ייבוא מ-CSV של Sally
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {open ? "סגור" : "פתח"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground/85">
            העלה קובץ CSV שיצרת קודם מ-Sally. שורות עם externalId זהה
            לא יתווספו פעמיים — תקף לשחזור אחרי איפוס מכשיר.
          </p>

          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-background/40 p-3 text-[11px] text-muted-foreground hover:border-[color:var(--neon)]/60">
            <span>📄 בחר קובץ CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              שגיאה: {error}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-black/25 p-3 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-foreground">
                  זוהו <b dir="ltr">{rows.length}</b> שורות
                </span>
                {warnings.length > 0 ? (
                  <span className="text-[10px] text-amber-400">
                    {warnings.length} אזהרות
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={runImport}
                className="self-end rounded-lg border border-[#34D399]/40 bg-[#34D399]/12 px-3 py-2 text-[12px] font-medium text-[#34D399] hover:bg-[#34D399]/20 disabled:opacity-40"
              >
                {busy ? "מייבא..." : "ייבא הכל"}
              </button>
            </div>
          ) : null}

          {imported ? (
            <p className="rounded-lg border border-[#34D399]/30 bg-[#34D399]/10 p-2 text-[11px] text-[#34D399]">
              ייבוא הושלם: +{imported.added} נוספו · {imported.skipped} כפילויות.
            </p>
          ) : null}

          {warnings.length > 0 ? (
            <ul className="max-h-32 list-disc overflow-auto rounded-lg border border-white/8 bg-black/20 p-2 ps-5 text-[10px] text-muted-foreground">
              {warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
