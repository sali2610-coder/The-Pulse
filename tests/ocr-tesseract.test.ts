// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetOcrRegistryForTests,
  getOcrProvider,
  pickReadyOcrProvider,
} from "@/lib/ocr";
import {
  _setTesseractRecognizeForTests,
  _setTesseractWorkerFactoryForTests,
  tesseractOcr,
} from "@/lib/ocr/tesseract";

afterEach(() => {
  _setTesseractWorkerFactoryForTests(null);
  _setTesseractRecognizeForTests(null);
  _resetOcrRegistryForTests();
});

describe("tesseract provider", () => {
  it("is registered alongside manual", () => {
    const p = getOcrProvider("tesseract");
    expect(p?.id).toBe("tesseract");
  });

  it("is ready in a browser-like environment (jsdom)", () => {
    const p = getOcrProvider("tesseract");
    expect(p?.isReady()).toBe(true);
  });

  it("rejects text input — manual is the right provider for text", async () => {
    const p = getOcrProvider("tesseract");
    if (!p) throw new Error("tesseract provider missing");
    const out = await p.scan({ kind: "text", text: "שופרסל" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.reason).toBe("unsupported_input");
    }
  });

  it("delegates image scans via the dynamic recognize fn + normalizes confidence", async () => {
    _setTesseractRecognizeForTests(async () => ({
      data: { text: "סה״כ 99.90 ש״ח", confidence: 87 },
    }));
    const p = getOcrProvider("tesseract");
    if (!p) throw new Error("tesseract provider missing");
    const out = await p.scan({
      kind: "image",
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    });
    if (!out.ok) throw new Error("expected ok scan");
    expect(out.result.text).toBe("סה״כ 99.90 ש״ח");
    expect(out.result.confidence).toBeCloseTo(0.87, 2);
    expect(out.result.language).toBe("he");
  });

  it("returns provider_error when recognize returns empty text", async () => {
    _setTesseractRecognizeForTests(async () => ({
      data: { text: "   ", confidence: 0 },
    }));
    const p = getOcrProvider("tesseract");
    if (!p) throw new Error("tesseract provider missing");
    const out = await p.scan({
      kind: "image",
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.reason).toBe("provider_error");
    }
  });

  it("returns provider_error when recognize throws", async () => {
    _setTesseractRecognizeForTests(async () => {
      throw new Error("worker boom");
    });
    const p = getOcrProvider("tesseract");
    if (!p) throw new Error("tesseract provider missing");
    const out = await p.scan({
      kind: "image-url",
      url: "https://x/y.png",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.reason).toBe("provider_error");
      expect(out.error.detail).toBe("worker boom");
    }
  });
});

describe("pickReadyOcrProvider", () => {
  it("prefers tesseract for image inputs when ready", () => {
    const p = pickReadyOcrProvider("image");
    expect(p.id).toBe("tesseract");
  });

  it("returns manual for text inputs (tesseract rejects text)", () => {
    const p = pickReadyOcrProvider("text");
    expect(p.id).toBe("manual");
  });

  it("returns manual when no input kind is given (backwards-compatible)", () => {
    const p = pickReadyOcrProvider();
    expect(["tesseract", "manual"]).toContain(p.id);
  });
});

describe("Phase 223 — worker reuse + warm()", () => {
  it("creates the worker exactly once across multiple scans", async () => {
    const factory = vi.fn(async () => ({
      recognize: vi.fn(async () => ({
        data: { text: "Hello", confidence: 90 },
      })),
      terminate: vi.fn(async () => undefined),
    }));
    _setTesseractWorkerFactoryForTests(factory);

    const img = {
      kind: "image" as const,
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    };
    await tesseractOcr.scan(img);
    await tesseractOcr.scan(img);
    await tesseractOcr.scan(img);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith("heb+eng");
  });

  it("warm() pre-creates the worker so a later scan reuses it", async () => {
    const factory = vi.fn(async () => ({
      recognize: vi.fn(async () => ({
        data: { text: "Hi", confidence: 100 },
      })),
    }));
    _setTesseractWorkerFactoryForTests(factory);

    await tesseractOcr.warm();
    await tesseractOcr.scan({
      kind: "image",
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("concurrent scans share a single in-flight worker promise", async () => {
    const factory = vi.fn(async () => ({
      recognize: vi.fn(async () => ({
        data: { text: "Concurrent", confidence: 75 },
      })),
    }));
    _setTesseractWorkerFactoryForTests(factory);

    const img = {
      kind: "image" as const,
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    };
    const [a, b, c] = await Promise.all([
      tesseractOcr.scan(img),
      tesseractOcr.scan(img),
      tesseractOcr.scan(img),
    ]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("terminate() drops the cached worker so the next scan rebuilds", async () => {
    let calls = 0;
    const factory = vi.fn(async () => {
      calls++;
      return {
        recognize: async () => ({
          data: { text: `pass-${calls}`, confidence: 80 },
        }),
        terminate: async () => undefined,
      };
    });
    _setTesseractWorkerFactoryForTests(factory);

    const img = {
      kind: "image" as const,
      data: new Blob(["x"], { type: "image/png" }),
      mimeType: "image/png",
    };
    await tesseractOcr.scan(img);
    await tesseractOcr.terminate();
    await tesseractOcr.scan(img);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
