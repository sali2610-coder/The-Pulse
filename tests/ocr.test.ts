import { describe, expect, it } from "vitest";

import {
  _resetOcrRegistryForTests,
  getOcrProvider,
  parseReceiptText,
  pickReadyOcrProvider,
} from "@/lib/ocr";

describe("OCR registry", () => {
  it("manual provider is always ready", () => {
    _resetOcrRegistryForTests();
    const p = getOcrProvider("manual");
    expect(p).toBeDefined();
    expect(p?.isReady()).toBe(true);
  });

  it("picks manual when no paid provider is registered", () => {
    _resetOcrRegistryForTests();
    expect(pickReadyOcrProvider().id).toBe("manual");
  });
});

describe("manual provider", () => {
  it("echoes pasted text with confidence 1", async () => {
    const p = getOcrProvider("manual");
    if (!p) throw new Error("manual provider missing");
    const out = await p.scan({ kind: "text", text: "  שלום עולם  " });
    if (!out.ok) throw new Error("manual scan should succeed");
    expect(out.result.text).toBe("שלום עולם");
    expect(out.result.confidence).toBe(1);
  });

  it("rejects empty text", async () => {
    const p = getOcrProvider("manual");
    if (!p) throw new Error("manual provider missing");
    const out = await p.scan({ kind: "text", text: "   " });
    expect(out.ok).toBe(false);
  });

  it("rejects non-text input", async () => {
    const p = getOcrProvider("manual");
    if (!p) throw new Error("manual provider missing");
    const out = await p.scan({ kind: "image-url", url: "https://x/y.png" });
    expect(out.ok).toBe(false);
  });

  it("detects Hebrew vs mixed language hint", async () => {
    const p = getOcrProvider("manual");
    if (!p) throw new Error("manual provider missing");
    const he = await p.scan({ kind: "text", text: "שופרסל" });
    const mixed = await p.scan({ kind: "text", text: "Shufersal שופרסל" });
    if (!he.ok || !mixed.ok) throw new Error("scans should succeed");
    expect(he.result.language).toBe("he");
    expect(mixed.result.language).toBe("mixed");
  });
});

describe("parseReceiptText", () => {
  it("extracts amount + merchant from a typical Israeli receipt", () => {
    const text = [
      "שופרסל סניף הוד השרון",
      "תאריך 12/05/2026",
      "סה״כ 142.90 ש״ח",
    ].join("\n");
    const r = parseReceiptText(text);
    expect(r.amount).toBe(142.9);
    expect(r.merchant).toContain("שופרסל");
    expect(r.occurredAt?.slice(0, 10)).toBe("2026-05-12");
    expect(r.currency).toBe("ILS");
    expect(r.confident).toBe(true);
  });

  it("flags low confidence when amount cannot be parsed", () => {
    const r = parseReceiptText("שופרסל\nתאריך 12/05/2026");
    expect(r.amount).toBeUndefined();
    expect(r.confident).toBe(false);
  });

  it("detects USD when $ marker appears", () => {
    const r = parseReceiptText("Amazon\nTotal $42.10");
    expect(r.currency).toBe("USD");
    expect(r.amount).toBe(42.1);
  });

  it("ignores impossible dates", () => {
    const r = parseReceiptText("שופרסל\nסה״כ 100 ש״ח\n45/13/2026");
    expect(r.occurredAt).toBeUndefined();
  });

  it("strips header keywords when finding the merchant line", () => {
    const r = parseReceiptText(
      [
        "חשבונית מס",
        "Apple Store",
        "סה״כ 999 ש״ח",
      ].join("\n"),
    );
    expect(r.merchant?.toLowerCase()).toContain("apple");
  });
});
