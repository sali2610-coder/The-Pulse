"use client";

// Receipt-OCR entry. Behind a collapsed disclosure so it doesn't
// clutter Settings. Two input paths:
//   * paste text → manual provider
//   * upload image → tesseract.js provider (lazy WASM bundle)
// In both cases the parser does merchant/amount extraction and the
// user copies the values into the regular new-expense form. NO
// automatic addExpense — the foundation is deliberately read-only.

import { useState } from "react";
import { ScanText } from "lucide-react";

import {
  parseReceiptText,
  pickReadyOcrProvider,
  type ReceiptCandidate,
} from "@/lib/ocr";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

export function ReceiptScanCard() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [scanning, setScanning] = useState(false);
  const [parsed, setParsed] = useState<ReceiptCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);

  async function runTextScan() {
    setError(null);
    setParsed(null);
    setScanning(true);
    try {
      const provider = pickReadyOcrProvider("text");
      setProviderUsed(provider.id);
      const result = await provider.scan({ kind: "text", text: raw });
      if (!result.ok) {
        setError(result.error.detail ?? result.error.reason);
        return;
      }
      setParsed(parseReceiptText(result.result.text));
    } finally {
      setScanning(false);
    }
  }

  async function runImageScan(file: File) {
    setError(null);
    setParsed(null);
    setScanning(true);
    try {
      const provider = pickReadyOcrProvider("image");
      setProviderUsed(provider.id);
      const result = await provider.scan({
        kind: "image",
        data: file,
        mimeType: file.type || "image/jpeg",
      });
      if (!result.ok) {
        setError(result.error.detail ?? result.error.reason);
        return;
      }
      setRaw(result.result.text);
      setParsed(parseReceiptText(result.result.text));
    } finally {
      setScanning(false);
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
          <ScanText className="size-3 text-[color:var(--neon)]" />
          ניתוח קבלה (ניסיוני)
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {open ? "סגור" : "פתח"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground/85">
            הדבק טקסט מהקבלה, או העלה תמונה של הקבלה — Tesseract.js
            יקרא אותה בדפדפן (פעם ראשונה ייקח כמה שניות להוריד
            את החבילה). חילוץ סכום, בית עסק ותאריך. הוספה ידנית
            בלבד — לא נכתב חיוב אוטומטית.
          </p>

          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-background/40 p-3 text-[11px] text-muted-foreground hover:border-[color:var(--neon)]/60">
            <span>📷 העלה תמונת קבלה (JPG / PNG)</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={scanning}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runImageScan(f);
              }}
            />
          </label>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            aria-label="טקסט קבלה"
            placeholder="סה״כ 142.90 ש״ח&#10;שופרסל סניף הוד השרון&#10;12/05/2026"
            className="w-full rounded-xl border border-white/12 bg-background/40 p-3 text-[12px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
          />
          <button
            type="button"
            disabled={scanning || raw.trim().length === 0}
            onClick={runTextScan}
            className="self-end rounded-lg border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/12 px-3 py-1.5 text-[11px] text-[color:var(--neon)] disabled:opacity-40"
          >
            {scanning ? "מנתח..." : "נתח טקסט"}
          </button>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              שגיאה: {error}
            </p>
          ) : null}

          {parsed ? (
            <ul className="grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-black/25 p-3 text-[11px]">
              <Field label="סכום" value={parsed.amount !== undefined ? ILS.format(parsed.amount) : "—"} />
              <Field label="מטבע" value={parsed.currency ?? "—"} />
              <Field label="בית עסק" value={parsed.merchant ?? "—"} />
              <Field
                label="תאריך"
                value={parsed.occurredAt ? parsed.occurredAt.slice(0, 10) : "—"}
              />
              <Field
                label="ביטחון"
                value={parsed.confident ? "גבוה" : "נמוך — בדוק ידנית"}
              />
              {providerUsed ? (
                <Field label="מנוע" value={providerUsed} />
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        className="truncate text-[12px] text-foreground"
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}
