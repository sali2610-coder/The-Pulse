// Native push abstraction.
//
// PHASE 202 — abstraction only. Web Push (VAPID + sw.js) keeps
// running unmodified. When the app boots inside a Capacitor shell
// the bridge would register for APNs (iOS) or FCM (Android) and
// pipe the device token to the server. None of that runs yet.
//
// The shape mirrors what the future bridge will produce so
// downstream code can switch on `registerNativePush()` without
// per-platform conditionals.

import { detectPlatform, isNative } from "./platform";

export type NativePushRegistration =
  | { ok: true; token: string; platform: "ios" | "android" }
  | { ok: false; reason: "web_only" | "permission_denied" | "registration_failed"; detail?: string };

export async function registerNativePush(): Promise<NativePushRegistration> {
  if (!isNative()) {
    return { ok: false, reason: "web_only" };
  }
  // TODO(phase-203): wire @capacitor/push-notifications.
  //   * await PushNotifications.requestPermissions()
  //   * await PushNotifications.register()
  //   * subscribe to 'registration' for APNs/FCM token
  //   * POST { token, platform } to /api/push/subscribe-native
  //   * server stores per-user mapping under sally:push-native:<userId>
  return {
    ok: false,
    reason: "registration_failed",
    detail: "native push bridge not wired yet (phase 203)",
  };
}

export function nativePlatformLabel(): "ios" | "android" | "web" {
  const p = detectPlatform();
  if (p === "ios" || p === "android") return p;
  return "web";
}
