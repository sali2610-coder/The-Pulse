import { describe, expect, it } from "vitest";

import {
  amountsEqual,
  formatCurrencyAmount,
  fromAgorot,
  parseCurrencyAmount,
  roundToAgorot,
  toAgorot,
} from "@/lib/money";

describe("money", () => {
  describe("roundToAgorot", () => {
    it("snaps IEEE-754 noise to two decimals", () => {
      expect(roundToAgorot(0.1 + 0.2)).toBe(0.3);
      expect(roundToAgorot(10.5 + 9.4)).toBe(19.9);
      expect(roundToAgorot(59.905)).toBe(59.91);
      expect(roundToAgorot(13000.754)).toBe(13000.75);
    });

    it("handles NaN / non-finite gracefully", () => {
      expect(roundToAgorot(Number.NaN)).toBe(0);
      expect(roundToAgorot(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe("toAgorot / fromAgorot", () => {
    it("round-trips ILS amounts through integer agorot", () => {
      expect(toAgorot(59.9)).toBe(5990);
      expect(fromAgorot(5990)).toBe(59.9);
      expect(toAgorot(13000.75)).toBe(1300075);
      expect(fromAgorot(1300075)).toBe(13000.75);
    });

    it("survives the float-add round trip", () => {
      const sum = 10.5 + 9.4;
      expect(fromAgorot(toAgorot(sum))).toBe(19.9);
    });
  });

  describe("parseCurrencyAmount", () => {
    it("returns undefined for empty input", () => {
      expect(parseCurrencyAmount("")).toBeUndefined();
      expect(parseCurrencyAmount("   ")).toBeUndefined();
    });

    it("strips non-numeric characters and parses agorot", () => {
      expect(parseCurrencyAmount("59.90")).toBe(59.9);
      expect(parseCurrencyAmount("₪59.90")).toBe(59.9);
      expect(parseCurrencyAmount("13,000.75")).toBe(13000.75);
    });

    it("caps to two fractional digits", () => {
      expect(parseCurrencyAmount("59.905")).toBe(59.9);
      expect(parseCurrencyAmount("0.999")).toBe(0.99);
    });

    it("collapses multiple dots to the first one", () => {
      expect(parseCurrencyAmount("12.3.4")).toBe(12.34);
    });
  });

  describe("formatCurrencyAmount", () => {
    it("renders integer amounts without decimals", () => {
      expect(formatCurrencyAmount(350)).toMatch(/350/);
      expect(formatCurrencyAmount(350)).not.toMatch(/350\.00/);
    });

    it("renders fractional amounts with two decimals", () => {
      expect(formatCurrencyAmount(59.9)).toMatch(/59\.90/);
      expect(formatCurrencyAmount(13000.75)).toMatch(/13,000\.75/);
    });

    it("renders signed negatives", () => {
      expect(formatCurrencyAmount(-1250.35)).toMatch(/1,250\.35/);
    });

    it("forceDecimals shows .00 even for integers", () => {
      expect(formatCurrencyAmount(350, { forceDecimals: true })).toMatch(
        /350\.00/,
      );
    });
  });

  describe("amountsEqual", () => {
    it("treats IEEE-754-equivalent sums as equal", () => {
      expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true);
      expect(amountsEqual(10.5 + 9.4, 19.9)).toBe(true);
    });

    it("rejects amounts that differ by agorot", () => {
      expect(amountsEqual(59.9, 59.91)).toBe(false);
    });
  });
});
