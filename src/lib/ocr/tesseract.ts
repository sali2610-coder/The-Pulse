// Phase 220 — Tesseract.js OCR provider.
//
// In-browser image OCR. Tesseract ships as a WASM bundle (~5 MB),
// so the module is dynamic-imported on first scan() to keep the
// PWA cold install lean. Trained data (heb+eng) is fetched lazily
// from the Tesseract CDN by the worker itself; we don't bundle it.
//
// isReady() is true only on the client and only for image inputs —
// SSR returns false so call sites fall back to the manual provider.
// Errors degrade to OcrError shapes; the registry's pickReadyOcrProvider
// still returns manual if tesseract throws at import time.

import type {
  OcrInput,
  OcrOutcome,
  OcrProvider,
  OcrProviderId,
} from "./types";

type RecognizeFn = (
  image: Blob | string,
  langs?: string,
) => Promise<{ data: { text: string; confidence: number } }>;

let cached: RecognizeFn | null = null;

async function loadRecognize(): Promise<RecognizeFn> {
  if (cached) return cached;
  // Dynamic import keeps the WASM bundle out of the initial chunk.
  const mod = await import("tesseract.js");
  // Default export shape across versions: `mod.recognize` or `mod.default.recognize`.
  const rec =
    (mod as unknown as { recognize?: RecognizeFn }).recognize ??
    (mod as unknown as { default?: { recognize?: RecognizeFn } }).default
      ?.recognize;
  if (!rec) {
    throw new Error("tesseract.js missing `recognize` export");
  }
  cached = rec;
  return rec;
}

function detectLanguageHint(text: string): "he" | "en" | "mixed" {
  const hasHebrew = /[֐-׿]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasHebrew && hasLatin) return "mixed";
  if (hasHebrew) return "he";
  return "en";
}

export class TesseractOcrProvider implements OcrProvider {
  readonly id: OcrProviderId = "tesseract";

  isReady(): boolean {
    // Browser-only: SSR bails out, the actual WASM/worker loading is
    // gated by the dynamic import inside scan() and any failure there
    // surfaces as a provider_error (kept off the SSR critical path).
    return typeof window !== "undefined";
  }

  async scan(input: OcrInput): Promise<OcrOutcome> {
    if (!this.isReady()) {
      return {
        ok: false,
        error: {
          reason: "not_configured",
          detail: "tesseract requires a browser environment",
        },
      };
    }
    if (input.kind === "text") {
      return {
        ok: false,
        error: {
          reason: "unsupported_input",
          detail: "tesseract is for images — use the manual provider for text",
        },
      };
    }
    const started =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const recognize = await loadRecognize();
      const image = input.kind === "image" ? input.data : input.url;
      const res = await recognize(image, "heb+eng");
      const ended =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const text = (res.data.text ?? "").trim();
      if (text.length === 0) {
        return {
          ok: false,
          error: {
            reason: "provider_error",
            detail: "tesseract returned empty text",
          },
        };
      }
      // Tesseract reports 0..100 — normalize to 0..1.
      const rawConf = Number(res.data.confidence ?? 0);
      const confidence = Math.max(0, Math.min(1, rawConf / 100));
      return {
        ok: true,
        result: {
          text,
          confidence,
          language: detectLanguageHint(text),
          durationMs: Math.max(0, Math.round(ended - started)),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          reason: "provider_error",
          detail: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

export const tesseractOcr = new TesseractOcrProvider();

/** Test-only seam: lets unit tests stub the dynamic-imported recognize
 *  function without pulling the WASM bundle. */
export function _setTesseractRecognizeForTests(fn: RecognizeFn | null): void {
  cached = fn;
}
