import { describe, expect, it } from "vitest";

import {
  BLUR,
  ELEVATION,
  SAFE_AREA,
  TOUCH_TARGET,
  Z,
  tokens,
} from "@/lib/design-system";

describe("design-system tokens", () => {
  it("exposes a strictly-increasing z-index scale", () => {
    const order = [
      Z.base,
      Z.raised,
      Z.sticky,
      Z.floating,
      Z.drawer,
      Z.sheet,
      Z.backdrop,
      Z.popup,
      Z.toast,
      Z.alert,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it("ships every blur tier as a usable Tailwind class string", () => {
    for (const value of Object.values(BLUR)) {
      expect(typeof value).toBe("string");
      expect(value).toMatch(/backdrop-blur/);
    }
  });

  it("ships every elevation tier (except none) as a raw CSS shadow", () => {
    expect(ELEVATION.none).toBe("none");
    for (const [name, value] of Object.entries(ELEVATION)) {
      if (name === "none") continue;
      expect(typeof value).toBe("string");
      expect(value).toMatch(/rgba\(/);
    }
  });

  it("safe-area tokens use env() expressions with sane fallbacks", () => {
    expect(SAFE_AREA.top).toMatch(/env\(safe-area-inset-top/);
    expect(SAFE_AREA.bottom).toMatch(/env\(safe-area-inset-bottom/);
    expect(SAFE_AREA.viewportHeight).toMatch(/calc\(100vh/);
  });

  it("touch-target minimums respect iOS HIG (≥ 44pt)", () => {
    expect(TOUCH_TARGET.min).toBeGreaterThanOrEqual(44);
    expect(TOUCH_TARGET.comfort).toBeGreaterThanOrEqual(TOUCH_TARGET.min);
  });

  it("exports a unified `tokens` namespace", () => {
    expect(tokens.Z).toBe(Z);
    expect(tokens.BLUR).toBe(BLUR);
    expect(tokens.ELEVATION).toBe(ELEVATION);
    expect(tokens.SAFE_AREA).toBe(SAFE_AREA);
    expect(tokens.TOUCH_TARGET).toBe(TOUCH_TARGET);
  });
});
