// Receipt-OCR provider contract.
//
// The Pulse currently runs without any paid OCR backend. This module
// defines the interface every future provider must satisfy so the UI
// and parser code can target a single shape regardless of who actually
// reads the image.
//
// Providers that are envisioned but NOT YET wired:
//   - "tesseract" — Tesseract.js, fully in-browser, Heeb + Eng trained
//     data shipped as a WASM bundle (~5 MB). Suits offline-first use,
//     trades accuracy on noisy receipts.
//   - "vision"   — Google Cloud Vision DOCUMENT_TEXT_DETECTION via a
//     server proxy (/api/ocr/scan). Highest accuracy, ~$1.50 per 1k
//     pages, requires service-account credentials.
//
// Today only the "manual" provider exists — the user pastes receipt
// text by hand and the parser does the heuristic extraction.

export type OcrProviderId = "manual" | "tesseract" | "vision";

export type OcrInput =
  | { kind: "text"; text: string }
  | { kind: "image"; data: Blob; mimeType: string }
  | { kind: "image-url"; url: string };

export type OcrResult = {
  /** Raw text the provider produced. May still contain newlines, noise,
   *  partial words. Downstream parser does merchant/amount extraction. */
  text: string;
  /** Provider-reported confidence in [0,1] when available. Manual paste
   *  reports 1.0; real OCR providers populate the model's own score. */
  confidence: number;
  /** When the provider has a strong opinion on locale/script. The
   *  parser uses this to pick currency hints (₪ for "he"). */
  language?: "he" | "en" | "mixed";
  /** Round-trip latency in ms. Cheap diagnostic for cost monitoring
   *  once paid providers are wired. */
  durationMs: number;
};

export type OcrError =
  | { reason: "not_configured"; detail?: string }
  | { reason: "unsupported_input"; detail?: string }
  | { reason: "provider_error"; detail?: string }
  | { reason: "rate_limited"; detail?: string };

export type OcrOutcome =
  | { ok: true; result: OcrResult }
  | { ok: false; error: OcrError };

export interface OcrProvider {
  readonly id: OcrProviderId;
  /** True when the provider can serve a request right now. The manual
   *  provider is always available; cloud providers gate on env config. */
  isReady(): boolean;
  scan(input: OcrInput): Promise<OcrOutcome>;
}
