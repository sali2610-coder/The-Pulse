// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPlatform,
  hasHapticEngine,
  isNative,
  isPwa,
  isStandalone,
  requestNotificationPermission,
  share,
} from "@/lib/native-bridge";

const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(value: string): void {
  Object.defineProperty(navigator, "userAgent", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  setUserAgent(ORIGINAL_UA);
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.restoreAllMocks();
});

describe("native-bridge", () => {
  function setMatchMedia(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      value: (q: string) =>
        ({
          matches,
          media: q,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
      configurable: true,
    });
  }

  it("returns web when nothing identifies a shell", () => {
    setUserAgent("Mozilla/5.0 (Macintosh)");
    setMatchMedia(false);
    expect(getPlatform()).toBe("web");
  });

  it("identifies iOS PWA via display-mode standalone", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari",
    );
    setMatchMedia(true);
    expect(getPlatform()).toBe("ios-pwa");
    expect(isPwa()).toBe(true);
    expect(isStandalone()).toBe(true);
    expect(isNative()).toBe(false);
  });

  it("identifies a Capacitor iOS shell as native", () => {
    setUserAgent("Mozilla/5.0 (iPhone)");
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      getPlatform: () => "ios",
    };
    expect(getPlatform()).toBe("ios-native");
    expect(isNative()).toBe(true);
  });

  it("share falls back to clipboard when no share API", async () => {
    delete (navigator as unknown as { share?: unknown }).share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const ok = await share({ url: "https://example.com" });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.com");
  });

  it("requestNotificationPermission returns granted when already granted", async () => {
    Object.defineProperty(window, "Notification", {
      value: {
        permission: "granted",
        requestPermission: vi.fn(),
      },
      configurable: true,
    });
    const out = await requestNotificationPermission();
    expect(out).toBe("granted");
  });

  it("hasHapticEngine reflects navigator.vibrate availability", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => true,
      configurable: true,
    });
    expect(hasHapticEngine()).toBe(true);
  });
});
