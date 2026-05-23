// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _resetPlatformCacheForTests,
  detectPlatform,
  isAndroid,
  isIOS,
  isNative,
} from "@/lib/native/platform";
import {
  _emitLifecycleForTests,
  _stopLifecycleForTests,
  onLifecycle,
} from "@/lib/native/lifecycle";
import {
  _resetSecureStorageForTests,
  getSecure,
  removeSecure,
  setSecure,
} from "@/lib/native/secure-storage";
import { nativePlatformLabel, registerNativePush } from "@/lib/native/push";

type CapBridge = {
  isNativePlatform: () => boolean;
  getPlatform: () => "ios" | "android" | "web";
};

function installCapacitor(bridge: CapBridge | null): void {
  const w = window as unknown as { Capacitor?: CapBridge | null };
  if (bridge === null) {
    delete w.Capacitor;
  } else {
    w.Capacitor = bridge;
  }
  _resetPlatformCacheForTests();
}

describe("native/platform", () => {
  afterEach(() => {
    installCapacitor(null);
  });

  it("returns 'web' in a vanilla jsdom (no Capacitor, no standalone)", () => {
    installCapacitor(null);
    expect(detectPlatform()).toBe("web");
    expect(isNative()).toBe(false);
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(false);
  });

  it("returns 'ios' when Capacitor reports native ios", () => {
    installCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    });
    expect(detectPlatform()).toBe("ios");
    expect(isNative()).toBe(true);
    expect(isIOS()).toBe(true);
  });

  it("returns 'android' when Capacitor reports native android", () => {
    installCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "android",
    });
    expect(detectPlatform()).toBe("android");
    expect(isAndroid()).toBe(true);
  });

  it("caches detection so a runtime Capacitor unload doesn't flip platform", () => {
    installCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    });
    expect(detectPlatform()).toBe("ios");
    delete (window as unknown as { Capacitor?: CapBridge }).Capacitor;
    // No cache reset → still ios.
    expect(detectPlatform()).toBe("ios");
  });
});

describe("native/lifecycle", () => {
  beforeEach(() => {
    _stopLifecycleForTests();
  });

  it("notifies listeners on resumed + backgrounded", () => {
    const seen: string[] = [];
    onLifecycle((e) => seen.push(e));
    _emitLifecycleForTests("resumed");
    _emitLifecycleForTests("backgrounded");
    expect(seen).toEqual(["resumed", "backgrounded"]);
  });

  it("unsubscribe stops further notifications", () => {
    const seen: string[] = [];
    const off = onLifecycle((e) => seen.push(e));
    _emitLifecycleForTests("resumed");
    off();
    _emitLifecycleForTests("resumed");
    expect(seen).toEqual(["resumed"]);
  });

  it("a throwing listener doesn't break the dispatcher", () => {
    const seen: string[] = [];
    onLifecycle(() => {
      throw new Error("boom");
    });
    onLifecycle((e) => seen.push(e));
    _emitLifecycleForTests("resumed");
    expect(seen).toEqual(["resumed"]);
  });
});

describe("native/secure-storage", () => {
  beforeEach(() => _resetSecureStorageForTests());

  it("namespaces keys + round-trips", async () => {
    await setSecure("token", "abc");
    expect(await getSecure("token")).toBe("abc");
    expect(window.localStorage.getItem("sally.secure.v1:token")).toBe("abc");
  });

  it("remove clears the value", async () => {
    await setSecure("k", "v");
    await removeSecure("k");
    expect(await getSecure("k")).toBeNull();
  });

  it("non-existent keys return null", async () => {
    expect(await getSecure("missing")).toBeNull();
  });
});

describe("native/push", () => {
  afterEach(() => installCapacitor(null));

  it("returns web_only on the web", async () => {
    installCapacitor(null);
    const r = await registerNativePush();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("web_only");
  });

  it("returns registration_failed placeholder when native bridge not wired", async () => {
    installCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    });
    const r = await registerNativePush();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("registration_failed");
  });

  it("nativePlatformLabel echoes detected platform", () => {
    installCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "android",
    });
    expect(nativePlatformLabel()).toBe("android");
  });
});
