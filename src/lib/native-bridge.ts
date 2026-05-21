// Phase D — Native wrapper preparation.
//
// Thin abstraction over platform-sensitive APIs (share, notification
// permission, platform detection) so future migration to a native
// shell (Capacitor / React Native) is a swap behind this module
// rather than a sweep across every consumer.
//
// Today: every method uses the appropriate web API.
// Tomorrow: the same surface delegates to Capacitor plugins via
// dynamic import, gated on `getPlatform()` returning a "native-*"
// value.
//
// Zero new dependencies. Web-only consumers see no behavior change.

export type Platform =
  | "web"
  | "ios-pwa"
  | "android-pwa"
  | "ios-native"
  | "android-native"
  | "unknown";

/** True when the page is running in a standalone PWA / native shell
 *  context — not in a regular browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS PWA: navigator.standalone (legacy)
  const navStandalone = (
    navigator as Navigator & { standalone?: boolean }
  ).standalone;
  if (navStandalone === true) return true;
  // PWA Display Mode: works on Android Chrome + modern iOS
  try {
    if (
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      return true;
    }
  } catch {
    /* matchMedia missing in some embed contexts */
  }
  return false;
}

/** Coarse platform fingerprint. Used by the bridge to pick the
 *  right plugin and by analytics to bucket users. Detection is
 *  intentionally conservative — when in doubt, return "web". */
export function getPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = (navigator.userAgent || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  // Capacitor sets a global when running inside a native shell.
  const inCapacitor = Boolean(
    (window as unknown as { Capacitor?: unknown }).Capacitor,
  );
  if (inCapacitor && isIOS) return "ios-native";
  if (inCapacitor && isAndroid) return "android-native";
  if (isStandalone()) {
    if (isIOS) return "ios-pwa";
    if (isAndroid) return "android-pwa";
  }
  return "web";
}

/** True when the running platform is a native shell. */
export function isNative(): boolean {
  const p = getPlatform();
  return p === "ios-native" || p === "android-native";
}

/** True when the running platform is a standalone PWA (any OS). */
export function isPwa(): boolean {
  const p = getPlatform();
  return p === "ios-pwa" || p === "android-pwa";
}

export type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
};

/** Web Share API today; Capacitor Share in the future. Falls back
 *  to copying the URL to the clipboard when no share sheet is
 *  available. Returns true on success. */
export async function share(input: ShareInput): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const canShare =
    "share" in navigator &&
    (!("canShare" in navigator) ||
      (
        navigator as Navigator & {
          canShare?: (data: ShareInput) => boolean;
        }
      ).canShare?.(input) !== false);
  if (canShare) {
    try {
      await (
        navigator as Navigator & {
          share: (data: ShareInput) => Promise<void>;
        }
      ).share(input);
      return true;
    } catch {
      /* user cancelled or share rejected — fall through */
    }
  }
  // Fallback: clipboard
  const text =
    input.url ??
    input.text ??
    input.title ??
    "";
  if (text && "clipboard" in navigator && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* clipboard refused — give up */
    }
  }
  return false;
}

/** Request notification permission via the web API. The web side
 *  uses Notification.requestPermission; the native side will swap
 *  in Capacitor LocalNotifications.requestPermissions. */
export async function requestNotificationPermission(): Promise<
  "granted" | "denied" | "default"
> {
  if (typeof window === "undefined") return "default";
  const N = (window as unknown as { Notification?: typeof Notification })
    .Notification;
  if (!N) return "default";
  if (N.permission === "granted") return "granted";
  if (N.permission === "denied") return "denied";
  try {
    const result = await N.requestPermission();
    return result;
  } catch {
    return "default";
  }
}

/** Detect haptics availability without actually firing. The
 *  Vibration API is the only web haptic primitive; future native
 *  shells will use UIImpactFeedbackGenerator (iOS) /
 *  HapticFeedback (Android). */
export function hasHapticEngine(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}
