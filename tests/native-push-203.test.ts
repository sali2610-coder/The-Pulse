// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  buildNativePushTokenRecord,
  nativePushTokenInputSchema,
  validateNativePushTokenInput,
} from "@/lib/native/push-token";
import {
  _resetLastNativeRegistrationForTests,
  readLastNativeRegistration,
  registerNativePush,
  nativePlatformLabel,
} from "@/lib/native/push";
import { _resetPlatformCacheForTests } from "@/lib/native/platform";
import {
  sendNativePush,
  shouldFallbackToWebPush,
} from "@/lib/push-native-server";
import type { Scope } from "@/lib/scope";

type CapBridge = {
  isNativePlatform: () => boolean;
  getPlatform: () => "ios" | "android" | "web";
};

function installCapacitor(bridge: CapBridge | null): void {
  const w = window as unknown as { Capacitor?: CapBridge | null };
  if (bridge === null) delete w.Capacitor;
  else w.Capacitor = bridge;
  _resetPlatformCacheForTests();
}

afterEach(() => {
  installCapacitor(null);
  _resetLastNativeRegistrationForTests();
});

describe("push-token validator", () => {
  it("accepts a well-formed ios payload", () => {
    const r = validateNativePushTokenInput({
      platform: "ios",
      token: "a".repeat(64),
      deviceId: "device-xyz",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown platform", () => {
    const r = validateNativePushTokenInput({
      platform: "blackberry",
      token: "a".repeat(64),
      deviceId: "d",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects too-short tokens", () => {
    const r = validateNativePushTokenInput({
      platform: "android",
      token: "short",
      deviceId: "d",
    });
    expect(r.ok).toBe(false);
  });

  it("preserves createdAt on a re-registration", () => {
    const input = nativePushTokenInputSchema.parse({
      platform: "ios",
      token: "a".repeat(64),
      deviceId: "d",
    });
    const rec = buildNativePushTokenRecord({
      input,
      previousCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(rec.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(rec.updatedAt).not.toBe(rec.createdAt);
  });

  it("trims optional fields when absent", () => {
    const input = nativePushTokenInputSchema.parse({
      platform: "android",
      token: "b".repeat(80),
      deviceId: "d",
    });
    const rec = buildNativePushTokenRecord({ input });
    expect(rec.userId).toBeUndefined();
    expect(rec.appVersion).toBeUndefined();
  });
});

describe("registerNativePush (web path)", () => {
  it("returns web_only when Capacitor isn't loaded", async () => {
    installCapacitor(null);
    const r = await registerNativePush();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("web_only");
    // stamp the local 'last' record so the diag UI surfaces it.
    const last = readLastNativeRegistration();
    expect(last).not.toBeNull();
    expect(last?.reason).toBe("web_only");
  });

  it("nativePlatformLabel returns 'web' on jsdom", () => {
    installCapacitor(null);
    expect(nativePlatformLabel()).toBe("web");
  });
});

describe("sendNativePush + shouldFallbackToWebPush", () => {
  const deviceScope: Scope = { kind: "device", id: "test-dev" };

  it("noTokens=true when KV has nothing for the scope", async () => {
    // KV stub returns no tokens out of the box in unit tests
    // (kv() not configured). listNativePushTokens returns [].
    const r = await sendNativePush({
      scope: deviceScope,
      payload: { title: "hi" },
    });
    expect(r.noTokens).toBe(true);
    expect(shouldFallbackToWebPush(r)).toBe(true);
  });
});
