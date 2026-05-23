// Capacitor configuration for The Pulse native shells.
//
// PHASE 202 — scaffold only. The web app remains the canonical
// surface and is shipped to Vercel as today (dynamic Next.js
// runtime, NOT static export). Native iOS / Android projects are
// generated locally on a developer Mac via `npx cap add ios` /
// `npx cap add android` and are .gitignored from this repo until
// the project promotes them.
//
// webDir is set to `out` so a future `next build && next export`
// pipeline could populate it. Today the web is dynamic and the
// native shell — once generated — should be configured to load
// the deployed Vercel origin via `server.url` (see
// docs/native-phase-202.md).

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.thepulse.app",
  appName: "The Pulse",
  webDir: "out",
  // Bundle ids + display name are placeholders. Update before
  // submitting to App Store Connect / Play Console.
  ios: {
    contentInset: "always",
    backgroundColor: "#0A0A0A",
    // Native scrollbars off so the dashboard glass surfaces look
    // identical to the PWA.
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0A0A0A",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#0A0A0A",
      // No splash image yet — Capacitor falls back to a blank
      // backgroundColor render, which matches the dashboard's
      // dark theme cleanly.
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      // Resize the viewport rather than the body so RTL forms
      // (AnchorInput / ExpenseDialog) don't shift left/right.
      resize: "ionic" as const,
      style: "DARK" as const,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0A0A",
      overlaysWebView: false,
    },
  },
};

export default config;
