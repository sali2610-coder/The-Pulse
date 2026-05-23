// Storage facade for the native shell.
//
// PHASE 202 — interface only. No data migration. Existing Zustand
// `persist` stays bound to localStorage. The native shell shares
// the same localStorage backing through Capacitor's WKWebView /
// Android WebView so the existing financial state continues to load
// untouched.
//
// When future native code wants ACTUAL secure storage (Keychain on
// iOS, EncryptedSharedPreferences on Android) the API stays the
// same — only the underlying transport changes. Drop-in replacement
// for callers like API tokens, push auth keys, recovery codes.
//
// API
//   getSecure(key)     → string | null
//   setSecure(key, v)  → void
//   removeSecure(key)  → void
//
// Async by default because the real Keychain bridge is async.
// Today these resolve synchronously over localStorage but call sites
// must await them so a Capacitor swap is a one-line change.

import { isNative } from "./platform";

const NAMESPACE = "sally.secure.v1";
const namespaceKey = (k: string) => `${NAMESPACE}:${k}`;

export async function getSecure(key: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (isNative()) {
    // TODO(phase-203): wire @capacitor-community/secure-storage or
    // capacitor-secure-storage-plugin. For now native falls through to
    // localStorage so first-launch UX still works.
  }
  try {
    return window.localStorage.getItem(namespaceKey(key));
  } catch {
    return null;
  }
}

export async function setSecure(key: string, value: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNative()) {
    // TODO(phase-203): write to Keychain / EncryptedSharedPreferences.
  }
  try {
    window.localStorage.setItem(namespaceKey(key), value);
  } catch {
    /* quota / disabled storage — silent */
  }
}

export async function removeSecure(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNative()) {
    // TODO(phase-203): clear from Keychain / EncryptedSharedPreferences.
  }
  try {
    window.localStorage.removeItem(namespaceKey(key));
  } catch {
    /* ignore */
  }
}

/** Test-only: wipe every namespaced key. */
export function _resetSecureStorageForTests(): void {
  if (typeof window === "undefined") return;
  try {
    const toDrop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${NAMESPACE}:`)) toDrop.push(k);
    }
    for (const k of toDrop) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
