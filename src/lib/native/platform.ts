// Single platform detector. Everywhere else in the app imports from
// here so we never sprinkle `Capacitor.isNativePlatform()` or
// `window` checks across components.
//
// Detection rules:
//   - "ios"     → Capacitor reports native platform 'ios'.
//   - "android" → Capacitor reports native platform 'android'.
//   - "pwa"     → Web + display-mode standalone OR navigator.standalone.
//   - "web"     → Everything else (mobile Safari tab, desktop browser).
//
// Capacitor is loaded lazily — import is wrapped in a try/catch so a
// pure-web build that hasn't installed the Capacitor plugin doesn't
// throw at module load.

export type PulsePlatform = "ios" | "android" | "pwa" | "web";

type CapacitorBridge = {
  isNativePlatform: () => boolean;
  getPlatform: () => "ios" | "android" | "web";
};

let cachedPlatform: PulsePlatform | null = null;

function readCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  // Capacitor exposes itself on window.Capacitor at runtime. The npm
  // package also exports it, but importing it here forces a SSR bundle
  // surface we don't want. window-check keeps the dependency edge-soft.
  const w = window as unknown as { Capacitor?: CapacitorBridge };
  return w.Capacitor ?? null;
}

export function detectPlatform(): PulsePlatform {
  if (cachedPlatform) return cachedPlatform;
  if (typeof window === "undefined") {
    return "web";
  }
  const cap = readCapacitor();
  if (cap?.isNativePlatform()) {
    const native = cap.getPlatform();
    cachedPlatform = native === "ios" ? "ios" : native === "android" ? "android" : "web";
    return cachedPlatform;
  }
  // PWA detection — matches the same checks PushDiagnostics already uses.
  const nav = navigator as unknown as { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    false;
  cachedPlatform = standalone ? "pwa" : "web";
  return cachedPlatform;
}

export function isNative(): boolean {
  const p = detectPlatform();
  return p === "ios" || p === "android";
}

export function isIOS(): boolean {
  return detectPlatform() === "ios";
}

export function isAndroid(): boolean {
  return detectPlatform() === "android";
}

export function _resetPlatformCacheForTests(): void {
  cachedPlatform = null;
}
