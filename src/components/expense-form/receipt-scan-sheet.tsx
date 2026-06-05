"use client";

// Phase 386 — Receipt Scan Sheet.
//
// Mobile-first BottomSheet that lets the user photograph one or more
// receipt pages, runs them through /api/receipt/scan, then shows a
// confirmation panel listing every field the AI extracted. On
// confirm the parent ExpenseDialog prefills its form via onApply.
//
// Data safety: the sheet drops the File array on close or apply.
// Nothing is persisted to disk.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Plus,
  Scan,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import {
  scanReceiptImages,
  type ReceiptScanResult,
} from "@/lib/receipt-scan";

const MAX_PHOTOS = 6;

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

type PreviewItem = { file: File; url: string };

type Step = "capture" | "processing" | "review" | "error";

const PROCESSING_LINES = [
  "קורא את הקבלה...",
  "מזהה סכום, חנות ותאריך...",
  "בודק פריטים...",
];

export function ReceiptScanSheet({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (result: ReceiptScanResult) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="סריקת קבלה"
      fullScreen
      lockDismiss
    >
      {/* key remount on open/close cycle guarantees fresh state +
         photo URLs without setState-in-effect. */}
      {open ? (
        <ScanBody
          onOpenChange={onOpenChange}
          onApply={onApply}
        />
      ) : null}
    </BottomSheet>
  );
}

function ScanBody({
  onOpenChange,
  onApply,
}: {
  onOpenChange: (open: boolean) => void;
  onApply: (result: ReceiptScanResult) => void;
}) {
  const [photos, setPhotos] = useState<PreviewItem[]>([]);
  const [step, setStep] = useState<Step>("capture");
  const [result, setResult] = useState<ReceiptScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lineIdx, setLineIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<PreviewItem[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Rotate the processing copy every 1.4s so the wait feels active.
  useEffect(() => {
    if (step !== "processing") return;
    const id = setInterval(() => {
      setLineIdx((i) => (i + 1) % PROCESSING_LINES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [step]);

  // Revoke object URLs on unmount (sheet close).
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.warning(`עד ${MAX_PHOTOS} תמונות`);
      return;
    }
    const next: PreviewItem[] = [];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const f = files.item(i);
      if (!f) continue;
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (next.length === 0) return;
    setPhotos((cur) => [...cur, ...next]);
  };

  const removeAt = (idx: number) => {
    setPhotos((cur) => {
      const removed = cur[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return cur.filter((_, i) => i !== idx);
    });
  };

  const startScan = async () => {
    if (photos.length === 0) return;
    setStep("processing");
    const out = await scanReceiptImages(photos.map((p) => p.file));
    if (!out.ok) {
      setErrorMsg(out.message);
      setStep("error");
      return;
    }
    setResult(out.data);
    setStep("review");
    hapticSuccess();
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    onOpenChange(false);
  };

  const handleSnap = () => {
    hapticTap();
    inputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-4 pb-4" dir="rtl">
      <header className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-xl text-gold"
          style={{ background: "rgba(212,175,55,0.16)" }}
          aria-hidden
        >
          <Scan className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-section text-foreground">סריקת קבלה</span>
          <span className="text-caption text-muted-foreground">
            צלם, אשר, סיימת
          </span>
        </div>
      </header>

      {step === "capture" || step === "error" ? (
        <CaptureStep
          photos={photos}
          onAdd={handleSnap}
          onRemove={removeAt}
          inputRef={inputRef}
          onFiles={handleFiles}
          onSubmit={startScan}
          errorMsg={step === "error" ? errorMsg : ""}
        />
      ) : null}

      {step === "processing" ? <ProcessingStep line={PROCESSING_LINES[lineIdx]} /> : null}

      {step === "review" && result ? (
        <ReviewStep result={result} onCancel={() => setStep("capture")} onApply={apply} />
      ) : null}
    </div>
  );
}

function CaptureStep({
  photos,
  onAdd,
  onRemove,
  inputRef,
  onFiles,
  onSubmit,
  errorMsg,
}: {
  photos: PreviewItem[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
  onSubmit: () => void;
  errorMsg: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">
        צלם את הקבלה. אם היא ארוכה — אפשר לצלם מספר תמונות עד שרושמים
        נדלק וזה מבצע את הבדיקה ומילוי הפרטים ומגיע לי לאישור ובדיקה
        אם צריך לערוך לפני שמירה.
      </p>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-10 text-center transition-colors hover:border-white/40"
          aria-label="פתח מצלמה לצילום קבלה"
        >
          <span
            className="flex size-12 items-center justify-center rounded-2xl"
            style={{
              background: "rgba(212,175,55,0.14)",
              color: "#D4AF37",
            }}
          >
            <Camera className="size-6" />
          </span>
          <span className="text-[15px] font-medium text-foreground">
            פתח מצלמה
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            אפשר לצלם מספר תמונות ולשלב לקבלה אחת
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <div
              key={p.url}
              className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`קבלה ${idx + 1}`}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                aria-label="הסר תמונה"
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-foreground/85 backdrop-blur"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
              <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9.5px] text-foreground/85">
                {idx + 1}
              </span>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={onAdd}
              className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] text-foreground/85"
              aria-label="הוסף צילום"
            >
              <span className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground">
                <Plus className="size-5" aria-hidden />
                הוסף צילום
              </span>
            </button>
          ) : null}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          // Allow re-selecting the same file.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      {errorMsg ? (
        <p
          className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200"
          role="alert"
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          {errorMsg}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] text-foreground/90 transition-colors hover:border-white/20"
        >
          <ImageIcon className="size-3.5" aria-hidden />
          הוסף צילום
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onSubmit();
          }}
          disabled={photos.length === 0}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-[13.5px] font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
            color: "#1A140A",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 22px -6px rgba(212,175,55,0.55)",
          }}
        >
          <Scan className="size-3.5" aria-hidden />
          סיום וסריקה
        </button>
      </div>
    </div>
  );
}

function ProcessingStep({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        className="flex size-12 items-center justify-center rounded-full"
        style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}
        aria-hidden
      >
        <Loader2 className="size-6" />
      </motion.span>
      <span className="text-[14px] font-medium text-foreground">{line}</span>
      <span className="text-[11.5px] text-muted-foreground">
        כמה שניות בלבד. אל תסגור את המסך.
      </span>
    </div>
  );
}

function ReviewStep({
  result,
  onCancel,
  onApply,
}: {
  result: ReceiptScanResult;
  onCancel: () => void;
  onApply: () => void;
}) {
  const confidenceTone =
    result.confidence === "high"
      ? "#34D399"
      : result.confidence === "low"
        ? "#F87171"
        : "#FBBF24";
  const confidenceLabel =
    result.confidence === "high"
      ? "ביטחון גבוה"
      : result.confidence === "low"
        ? "צריך בדיקה"
        : "ביטחון בינוני";

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
          <CheckCircle2 className="size-4 text-emerald-300" aria-hidden />
          בדיקת קבלה
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10.5px]"
          style={{ color: confidenceTone, borderColor: `${confidenceTone}66` }}
        >
          {confidenceLabel}
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        <Row label="חנות" value={result.merchant ?? "—"} highlight={result.merchant !== null} />
        <Row
          label="סכום"
          value={result.total !== null ? ILS.format(result.total) : "—"}
          mono
          highlight={result.total !== null}
        />
        <Row label="תאריך" value={result.date ?? "—"} mono />
        <Row label="שעה" value={result.time ?? "—"} mono />
        <Row
          label="אמצעי תשלום"
          value={
            result.paymentMethod === "credit"
              ? "אשראי"
              : result.paymentMethod === "cash"
                ? "מזומן"
                : "—"
          }
        />
        {result.cardLast4 ? (
          <Row label="סיומת כרטיס" value={`····${result.cardLast4}`} mono />
        ) : null}
        {result.vat !== null ? (
          <Row label="מע״מ" value={ILS.format(result.vat)} mono />
        ) : null}
        {result.transactionNumber ? (
          <Row label="מספר עסקה" value={result.transactionNumber} mono />
        ) : null}
      </ul>

      {result.items.length > 0 ? (
        <details className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer px-3 py-2 text-[12px] text-foreground/85">
            פריטים שזוהו ({result.items.length})
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {result.items.map((it, idx) => (
              <li
                key={`${it.label}-${idx}`}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <span className="line-clamp-1 text-foreground/85">
                  {it.label}
                </span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="shrink-0 text-muted-foreground"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {it.price !== null ? ILS.format(it.price) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.note ? (
        <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[11.5px] text-muted-foreground">
          {result.note}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onCancel();
          }}
          className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 text-[13px] text-foreground/85 transition-colors hover:border-white/20"
        >
          צלם שוב
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onApply();
          }}
          className="flex-1 rounded-2xl py-2.5 text-[13.5px] font-semibold transition-transform active:scale-[0.98]"
          style={{
            background: "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
            color: "#1A140A",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 22px -6px rgba(212,175,55,0.55)",
          }}
        >
          שמור הוצאה
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono={mono ? "true" : undefined}
        dir={mono ? "ltr" : undefined}
        className="text-[12.5px] font-medium"
        style={{
          color: highlight ? "#D4AF37" : "var(--foreground)",
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
        }}
      >
        {value}
      </span>
    </li>
  );
}
