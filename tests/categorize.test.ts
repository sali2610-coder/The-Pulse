import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/parsers";

describe("categorize", () => {
  it("matches English Wallet-style supermarket merchants", () => {
    expect(categorize("Shufersal")).toBe("food");
    expect(categorize("SHUFERSAL DEAL")).toBe("food");
    expect(categorize("Rami Levy")).toBe("food");
    expect(categorize("Mega")).toBe("food");
  });

  it("matches Hebrew supermarkets", () => {
    expect(categorize("שופרסל")).toBe("food");
    expect(categorize("שופרסל דיל סניף 123")).toBe("food");
    expect(categorize("רמי לוי")).toBe("food");
  });

  it("matches coffee shops (Cofix, Aroma, café, etc.)", () => {
    expect(categorize("קופיקס")).toBe("food");
    expect(categorize("Cofix")).toBe("food");
    expect(categorize("Aroma Espresso")).toBe("food");
    expect(categorize("ארומה")).toBe("food");
    expect(categorize("Starbucks")).toBe("food");
  });

  it("matches gas stations bilingually", () => {
    expect(categorize("תחנת דלק פז")).toBe("transport");
    expect(categorize("Sonol")).toBe("transport");
    expect(categorize("Delek")).toBe("transport");
  });

  it("matches streaming + telco entertainment", () => {
    expect(categorize("Netflix")).toBe("entertainment");
    expect(categorize("Spotify")).toBe("entertainment");
    expect(categorize("Disney+")).toBe("entertainment");
  });

  it("matches utility bills bilingually", () => {
    expect(categorize("חברת חשמל")).toBe("bills");
    expect(categorize("ארנונה")).toBe("bills");
    expect(categorize("בזק")).toBe("bills");
  });

  it("matches pharmacy + clinics", () => {
    expect(categorize("Super Pharm")).toBe("health");
    expect(categorize("סופר פארם")).toBe("health");
    expect(categorize("clalit")).toBe("health");
  });

  it("falls back to 'other' for unknown merchants", () => {
    expect(categorize("Random Place")).toBe("other");
    expect(categorize("עסק לא ידוע")).toBe("other");
  });
});
