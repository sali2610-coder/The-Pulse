// Native push registration.
//
// On a Capacitor shell, requests permission, registers with
// APNs (iOS) or FCM (Android), captures the token, and POSTs it
// to /api/push/subscribe-native. On web the call short-circuits to
// `web_only` so the existing Web Push (VAPID) pipeline keeps
// running unmodified.
//
// All Capacitor APIs are loaded via dynamic import so the web
// bundle doesn't drag in the plugin code path.

import { detectPlatform, isNative } from "./platform";
import { getOrCreateDeviceId } from "@/lib/device-id";

export type NativePushRegistration =
  | {
      ok: true;
      platform: "ios" | "android";
      tokenPreview: string;
      registrationStatus: "registered" | "already_registered";
    }
  | {
      ok: false;
      reason:
        | "web_only"
        | "permission_denied"
        | "registration_failed"
        | "server_rejected"
        | "missing_token";
      detail?: string;
    };

export type LastNativeRegistration = {
  ts: number;
  ok: boolean;
  reason?: string;
  platform?: "ios" | "android";
  tokenPreview?: string;
};

const LAST_KEY = "sally.native-push.last.v1";

export async function registerNativePush(args?: {
  userId?: string;
  appVersion?: string;
}): Promise<NativePushRegistration> {
  if (!isNative()) {
    recordLast({ ok: false, reason: "web_only" });
    return { ok: false, reason: "web_only" };
  }
  const platform = detectPlatform();
  if (platform !== "ios" && platform !== "android") {
    recordLast({ ok: false, reason: "web_only" });
    return { ok: false, reason: "web_only" };
  }
  try {
    const mod = await import("@capacitor/push-notifications");
    const Push = mod.PushNotifications;

    const perm = await Push.requestPermissions();
    if (perm.receive !== "granted") {
      recordLast({ ok: false, reason: "permission_denied", platform });
      return { ok: false, reason: "permission_denied" };
    }

    const token = await waitForToken(Push);

    if (!token) {
      recordLast({ ok: false, reason: "missing_token", platform });
      return { ok: false, reason: "missing_token" };
    }

    const deviceId = getOrCreateDeviceId();
    const res = await fetch("/api/push/subscribe-native", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sally-device": deviceId,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        platform,
        token,
        deviceId,
        userId: args?.userId,
        appVersion: args?.appVersion,
      }),
    });
    if (!res.ok) {
      recordLast({ ok: false, reason: "server_rejected", platform });
      return {
        ok: false,
        reason: "server_rejected",
        detail: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json().catch(() => ({}))) as {
      rotated?: boolean;
    };
    const status = body.rotated ? "registered" : "already_registered";
    recordLast({
      ok: true,
      platform,
      tokenPreview: maskToken(token),
    });
    return {
      ok: true,
      platform,
      tokenPreview: maskToken(token),
      registrationStatus: status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLast({ ok: false, reason: "registration_failed" });
    return { ok: false, reason: "registration_failed", detail: msg };
  }
}

// Capacitor's PushNotifications surface — narrow shape, async listener
// handles, optional .register/.requestPermissions to keep the import
// lazy + typed.
type RegistrationEvent = { value: string };
type RegistrationErrorEvent = { error: string };
type PushPluginListenerHandle = { remove: () => Promise<void> };
type PushPluginShape = {
  register: () => Promise<void>;
  addListener: ((
    event: "registration",
    cb: (e: RegistrationEvent) => void,
  ) => Promise<PushPluginListenerHandle>) &
    ((
      event: "registrationError",
      cb: (e: RegistrationErrorEvent) => void,
    ) => Promise<PushPluginListenerHandle>);
};

async function waitForToken(Push: PushPluginShape): Promise<string | null> {
  // Race the 'registration' emit against a 10s safety timeout so a
  // stuck bridge never strands the caller.
  let regHandle: PushPluginListenerHandle | null = null;
  let errHandle: PushPluginListenerHandle | null = null;
  const cleanup = async () => {
    try {
      await regHandle?.remove();
    } catch {
      /* ignore */
    }
    try {
      await errHandle?.remove();
    } catch {
      /* ignore */
    }
  };

  return new Promise<string | null>(async (resolve) => {
    const settle = async (value: string | null) => {
      await cleanup();
      resolve(value);
    };
    const timeout = setTimeout(() => void settle(null), 10_000);
    regHandle = await Push.addListener("registration", (e) => {
      clearTimeout(timeout);
      void settle(e.value);
    });
    errHandle = await Push.addListener("registrationError", (e) => {
      clearTimeout(timeout);
      console.warn("[registerNativePush] registrationError", e.error);
      void settle(null);
    });
    try {
      await Push.register();
    } catch (err) {
      clearTimeout(timeout);
      console.warn("[registerNativePush] register() threw", err);
      void settle(null);
    }
  });
}

export function nativePlatformLabel(): "ios" | "android" | "web" {
  const p = detectPlatform();
  if (p === "ios" || p === "android") return p;
  return "web";
}

export function readLastNativeRegistration(): LastNativeRegistration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastNativeRegistration;
  } catch {
    return null;
  }
}

function recordLast(args: Omit<LastNativeRegistration, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const record: LastNativeRegistration = { ts: Date.now(), ...args };
    window.localStorage.setItem(LAST_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

function maskToken(t: string): string {
  if (t.length <= 12) return "*".repeat(t.length);
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export function _resetLastNativeRegistrationForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}
