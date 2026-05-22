import { describe, expect, it } from "vitest";

import { rateMetric } from "@/lib/web-vitals";

describe("rateMetric thresholds", () => {
  it("LCP good ≤ 2500, ni 2500-4000, poor > 4000", () => {
    expect(rateMetric("LCP", 1500)).toBe("good");
    expect(rateMetric("LCP", 2500)).toBe("good");
    expect(rateMetric("LCP", 2501)).toBe("needs-improvement");
    expect(rateMetric("LCP", 4000)).toBe("needs-improvement");
    expect(rateMetric("LCP", 4001)).toBe("poor");
  });

  it("CLS good ≤ 0.1, ni 0.1-0.25, poor > 0.25", () => {
    expect(rateMetric("CLS", 0)).toBe("good");
    expect(rateMetric("CLS", 0.1)).toBe("good");
    expect(rateMetric("CLS", 0.11)).toBe("needs-improvement");
    expect(rateMetric("CLS", 0.25)).toBe("needs-improvement");
    expect(rateMetric("CLS", 0.26)).toBe("poor");
  });

  it("FCP good ≤ 1800, ni 1800-3000, poor > 3000", () => {
    expect(rateMetric("FCP", 900)).toBe("good");
    expect(rateMetric("FCP", 1800)).toBe("good");
    expect(rateMetric("FCP", 1801)).toBe("needs-improvement");
    expect(rateMetric("FCP", 3000)).toBe("needs-improvement");
    expect(rateMetric("FCP", 3001)).toBe("poor");
  });

  it("TTFB good ≤ 800, ni 800-1800, poor > 1800", () => {
    expect(rateMetric("TTFB", 400)).toBe("good");
    expect(rateMetric("TTFB", 800)).toBe("good");
    expect(rateMetric("TTFB", 801)).toBe("needs-improvement");
    expect(rateMetric("TTFB", 1800)).toBe("needs-improvement");
    expect(rateMetric("TTFB", 1801)).toBe("poor");
  });
});
