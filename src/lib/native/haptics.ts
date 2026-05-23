// Native-aware haptics facade.
//
// Wraps the existing src/lib/haptics.ts Web Vibration helpers. On
// a Capacitor native shell we delegate to @capacitor/haptics so the
// user gets the system-quality Taptic Engine response instead of the
// software-buzz fallback. On web we keep the existing behavior
// untouched — every old call site continues to work without code
// change.
//
// API mirrors the existing { tap, soft, success } helpers so a
// future codemod can swap imports module-by-module.

import { tap as webTap, soft as webSoft, success as webSuccess } from "@/lib/haptics";
import { isNative } from "./platform";

type ImpactStyle = "Light" | "Medium" | "Heavy";

type CapHaptics = {
  impact: (opts: { style: ImpactStyle }) => Promise<void>;
  notification: (opts: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
};

let cachedNative: CapHaptics | null | undefined; // undefined = not tried yet

async function nativeHaptics(): Promise<CapHaptics | null> {
  if (cachedNative !== undefined) return cachedNative;
  try {
    const mod = await import("@capacitor/haptics");
    cachedNative = mod.Haptics as unknown as CapHaptics;
  } catch {
    cachedNative = null;
  }
  return cachedNative;
}

export async function tap(): Promise<void> {
  if (!isNative()) {
    webTap();
    return;
  }
  const cap = await nativeHaptics();
  if (cap) await cap.impact({ style: "Light" });
  else webTap();
}

export async function soft(): Promise<void> {
  if (!isNative()) {
    webSoft();
    return;
  }
  const cap = await nativeHaptics();
  if (cap) await cap.impact({ style: "Medium" });
  else webSoft();
}

export async function success(): Promise<void> {
  if (!isNative()) {
    webSuccess();
    return;
  }
  const cap = await nativeHaptics();
  if (cap) await cap.notification({ type: "SUCCESS" });
  else webSuccess();
}
