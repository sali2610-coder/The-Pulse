"use client";

/** True when the page is running as an installed PWA (Add to Home Screen). */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS-specific flag — older Safari versions only expose this.
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

/** Coarse iOS / Safari detection — used to tailor the install instructions. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
