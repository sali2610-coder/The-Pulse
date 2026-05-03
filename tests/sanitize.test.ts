import { describe, expect, it } from "vitest";
import { sanitizeMerchant, merchantKey } from "@/lib/sanitize";

describe("sanitizeMerchant", () => {
  it("canonicalizes Israeli supermarkets", () => {
    expect(sanitizeMerchant("שופרסל דיל סניף 123")).toBe("שופרסל");
    expect(sanitizeMerchant("ויקטורי 500")).toBe("ויקטורי");
    expect(sanitizeMerchant("רמי לוי שיווק השקמה")).toBe("רמי לוי");
  });

  it("canonicalizes pharmacies and fuel", () => {
    expect(sanitizeMerchant("super pharm 412")).toBe("סופר פארם");
    expect(sanitizeMerchant("PAZ 109 ASHDOD")).toBe("פז");
  });

  it("handles English brand normalization", () => {
    expect(sanitizeMerchant("APPLE.COM/BILL")).toBe("Apple");
    expect(sanitizeMerchant("ZARA NETANYA")).toBe("ZARA");
  });

  it("strips noise from unknown merchants", () => {
    expect(sanitizeMerchant("ABC קונדיטוריה סניף 7 ONLINE")).toBe(
      "ABC קונדיטוריה",
    );
  });

  it("returns trimmed original when nothing recognizable", () => {
    expect(sanitizeMerchant("  Café Local  ")).toBe("Café Local");
  });

  it("is idempotent", () => {
    const a = sanitizeMerchant("שופרסל דיל סניף 123");
    const b = sanitizeMerchant(a);
    expect(a).toBe(b);
  });

  it("preserves empty input safely", () => {
    expect(sanitizeMerchant("")).toBe("");
  });
});

describe("merchantKey", () => {
  it("yields the same key for variant spellings", () => {
    expect(merchantKey("שופרסל דיל סניף 123")).toBe(
      merchantKey("שופרסל"),
    );
    expect(merchantKey("super pharm 412")).toBe(merchantKey("סופר פארם"));
  });

  it("is case + punctuation insensitive", () => {
    expect(merchantKey("ZARA NETANYA")).toBe(merchantKey("zara"));
  });
});
