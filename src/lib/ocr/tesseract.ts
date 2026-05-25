// Phase 220 + 223 — Tesseract.js OCR provider with persistent worker.
//
// In-browser image OCR. Tesseract ships as a WASM bundle (~5 MB), so
// the module is dynamic-imported on first use. Phase 223 reuses a
// single Tesseract Worker across scans: createWorker() loads the
// heb+eng language packs once (~5 s on a cold network), and every
// subsequent recognize() call skips that cost.
//
//   * warm()      — pre-creates the worker. Cheap to call repeatedly
//                   (idempotent). Settings can call it when the
//                   ReceiptScanCard opens so the first real scan is
//                   already warm.
//   * scan()      — lazy-creates the worker if cold, then delegates
//                   recognize. Cached worker survives across scans
//                   for the lifetime of the page.
//   * terminate() — drops the cached worker. Called on logout / debug.
//
// isReady() is true only on the client; SSR returns false so call
// sites fall back to the manual provider.

import type {
  OcrInput,
  OcrOutcome,
  OcrProvider,
  OcrProviderId,
} from "./types";

type RecognizeResult = { data: { text: string; confidence: number } };

type TesseractWorker = {
  recognize(image: Blob | string): Promise<RecognizeResult>;
  terminate?(): Promise<void>;
};

type WorkerFactory = (langs: string) => Promise<TesseractWorker>;

let cachedWorker: TesseractWorker | null = null;
let pendingWorker: Promise<TesseractWorker> | null = null;
let workerFactoryOverride: WorkerFactory | null = null;

async function defaultWorkerFactory(langs: string): Promise<TesseractWorker> {
  const mod = await import("tesseract.js");
  type CreateWorkerFn = (
    langs: string | string[],
  ) => Promise<TesseractWorker>;
  const create =
    (mod as unknown as { createWorker?: CreateWorkerFn }).createWorker ??
    (mod as unknown as { default?: { createWorker?: CreateWorkerFn } })
      .default?.createWorker;
  if (!create) {
    throw new Error("tesseract.js missing `createWorker` export");
  }
  return create(langs);
}

async function getWorker(): Promise<TesseractWorker> {
  if (cachedWorker) return cachedWorker;
  if (pendingWorker) return pendingWorker;
  const factory = workerFactoryOverride ?? defaultWorkerFactory;
  pendingWorker = factory("heb+eng")
    .then((w) => {
      cachedWorker = w;
      pendingWorker = null;
      return w;
    })
    .catch((err) => {
      pendingWorker = null;
      throw err;
    });
  return pendingWorker;
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
    // Browser-only: SSR bails out, dynamic-import failures inside
    // scan() surface as provider_error.
    return typeof window !== "undefined";
  }

  /** Phase 223 — pre-create the worker. Callers don't need to await
   *  the result; any in-flight worker creation is reused by scan(). */
  warm(): Promise<void> {
    if (!this.isReady()) return Promise.resolve();
    return getWorker()
      .then(() => undefined)
      .catch(() => undefined);
  }

  /** Drop the cached worker. Subsequent scan() rebuilds it. */
  async terminate(): Promise<void> {
    const w = cachedWorker;
    cachedWorker = null;
    pendingWorker = null;
    if (w?.terminate) {
      try {
        await w.terminate();
      } catch {
        // ignore — we already cleared the reference.
      }
    }
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
      const worker = await getWorker();
      const image = input.kind === "image" ? input.data : input.url;
      const res = await worker.recognize(image);
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

// === Test seams =============================================================

/** @deprecated Phase 223 — kept as a thin shim so older tests written
 *  before the worker refactor still pass. Each call wraps the provided
 *  recognize function in a stub worker. Prefer
 *  `_setTesseractWorkerFactoryForTests` going forward. */
export function _setTesseractRecognizeForTests(
  fn: ((image: Blob | string) => Promise<RecognizeResult>) | null,
): void {
  cachedWorker = null;
  pendingWorker = null;
  if (!fn) {
    workerFactoryOverride = null;
    return;
  }
  workerFactoryOverride = async () => ({
    recognize: fn,
    terminate: async () => undefined,
  });
}

/** Inject a fake worker factory. The factory is invoked once per warm
 *  start; the returned worker is reused across all scan() calls until
 *  terminate() (or a new factory) replaces it. */
export function _setTesseractWorkerFactoryForTests(
  factory: WorkerFactory | null,
): void {
  cachedWorker = null;
  pendingWorker = null;
  workerFactoryOverride = factory;
}
