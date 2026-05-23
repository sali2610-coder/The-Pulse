"use client";

// Boot-time native bridge. Runs only inside a Capacitor shell:
//   * sets StatusBar.style + overlay so the dashboard's dark
//     background extends behind the iOS top notch
//   * marks the splash screen as ready and hides it
//   * exposes "platform: ios|android" as a data attribute on
//     <html> so CSS can branch on it (`html[data-platform="ios"]`)
//
// On the web this component is a no-op so the existing PWA path
// stays untouched.

import { useEffect } from "react";
import { detectPlatform, isNative } from "@/lib/native";

export function NativeShellProvider() {
  useEffect(() => {
    const platform = detectPlatform();
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-platform", platform);
    }
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      try {
        const statusBar = await import("@capacitor/status-bar");
        if (cancelled) return;
        await statusBar.StatusBar.setStyle({ style: statusBar.Style.Dark });
        await statusBar.StatusBar.setBackgroundColor({ color: "#0A0A0A" });
      } catch (err) {
        console.warn("[NativeShell] status bar wiring failed:", err);
      }
      try {
        const splash = await import("@capacitor/splash-screen");
        if (cancelled) return;
        await splash.SplashScreen.hide({ fadeOutDuration: 200 });
      } catch (err) {
        console.warn("[NativeShell] splash hide failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
