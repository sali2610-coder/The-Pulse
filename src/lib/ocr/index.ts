// OCR registry + facade.
//
// Single entry point for the rest of the app. The registry knows which
// providers exist, which are configured today, and returns the best
// available one for a given request. New providers register here so
// downstream call sites never grow per-provider branches.

import type { OcrProvider, OcrProviderId } from "./types";
import { manualOcr } from "./manual";

const REGISTRY: Map<OcrProviderId, OcrProvider> = new Map([
  ["manual", manualOcr],
]);

export function listOcrProviders(): OcrProvider[] {
  return [...REGISTRY.values()];
}

export function getOcrProvider(id: OcrProviderId): OcrProvider | undefined {
  return REGISTRY.get(id);
}

/** Pick the best provider that is ready right now. Order of preference:
 *    1. vision   (highest accuracy, paid)
 *    2. tesseract (in-browser, free, slower)
 *    3. manual   (always-available fallback)
 *  Today only "manual" is registered, but the order is defined so the
 *  upgrade path is clear. */
export function pickReadyOcrProvider(): OcrProvider {
  const preference: OcrProviderId[] = ["vision", "tesseract", "manual"];
  for (const id of preference) {
    const p = REGISTRY.get(id);
    if (p && p.isReady()) return p;
  }
  // Manual is unconditionally available; this is unreachable in practice.
  return manualOcr;
}

export { parseReceiptText } from "./parser";
export type { ReceiptCandidate } from "./parser";
export type {
  OcrInput,
  OcrOutcome,
  OcrProvider,
  OcrProviderId,
  OcrResult,
  OcrError,
} from "./types";

/** Test-only seam: lets unit tests register a stub provider without
 *  shipping a real one. NEVER call from production code. */
export function _registerOcrProviderForTests(p: OcrProvider): void {
  REGISTRY.set(p.id, p);
}

export function _resetOcrRegistryForTests(): void {
  REGISTRY.clear();
  REGISTRY.set("manual", manualOcr);
}
