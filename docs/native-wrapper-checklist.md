# Native Wrapper Checklist (Capacitor)

_Status: planning only — no native files in this repo._

Native iOS/Android shells unlock features the PWA cannot deliver on
Safari: persistent push without "Add to Home Screen", reliable
background tasks, Wallet Pass install hooks, Apple Pay / Google Pay
attestation, App Store + Play Store distribution. This document is
the cold-start checklist for wrapping The Pulse with
[Capacitor](https://capacitorjs.com) **when** native work moves out
of this read-only environment.

## When to start native work

Don't open this until all of:

- [ ] CI workflow (Phase 195) is green on `main` for 2 weeks.
- [ ] At least one Supabase column migration has shipped successfully
      (proves the schema-change muscle memory).
- [ ] `retryQueue` is persisted to localStorage (R1 in
      [production-readiness.md](./production-readiness.md)).
- [ ] At least one production user has reported a feature that
      requires native (e.g. Wallet Pass install, background scan).

Until then, the PWA path serves every user on iOS 16.4+ and modern
Chrome.

## Prerequisites — environment

- [ ] macOS 14+ with Xcode 16+ (App Store / TestFlight push).
- [ ] Apple Developer account ($99/yr), Pass Type ID registered,
      WWDR cert installed.
- [ ] Google Cloud project + Play Console account ($25 one-time).
- [ ] CocoaPods 1.16+ + Node 22 LTS.
- [ ] Android Studio Koala+ with Android 14/35 SDKs.

## Step 0 — branch off

```sh
git checkout -b native/capacitor-shell
```

Native artifacts (`/ios`, `/android`, `capacitor.config.ts`) live on
this branch initially. Merge to main only after the Web build still
passes locally + in CI and at least one E2E run is recorded on a
device or simulator.

## Step 1 — install Capacitor

```sh
npm i -E @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "The Pulse" com.thepulse.app --web-dir=out
```

Add `output: "export"` to `next.config.ts` **on the native branch only**.
The web app on Vercel must keep its dynamic routes — never merge that
config change back.

## Step 2 — generate platform projects

```sh
npm run build           # produces /out
npx cap add ios
npx cap add android
npx cap sync
```

Commit `/ios/App/App/Info.plist`, `/android/app/src/main/AndroidManifest.xml`,
`capacitor.config.ts`, but **not** Pods/build artifacts (extend
`.gitignore` accordingly).

## Step 3 — wire the native bridges

| Capability | Plugin | Notes |
|---|---|---|
| Push | `@capacitor/push-notifications` | Apple needs APNs auth key in `App.entitlements`. The web `Push API` code stays for graceful degrade. |
| OCR (Vision Kit) | `@capacitor-community/vision-kit` (iOS) or a custom plugin wrapping `MLKit` (Android) | Lets the OCR adapter (`src/lib/ocr/`) register a new provider. |
| Wallet Pass | Custom Capacitor plugin invoking `UIApplication.open` on a `pkpass` URL (iOS) and the Google Pay Save link (Android) | The builder in `src/lib/wallet-pass/` already produces the payload; only signing + delivery is missing. |
| Biometric unlock | `@capacitor-community/biometric-auth` | Optional; gate access to settings/auth-token. |
| Haptics | `@capacitor/haptics` | Already abstracted behind `src/lib/haptics.ts`. |

## Step 4 — auth handshake

Supabase auth uses cookies via `@supabase/ssr`. Capacitor's `WKWebView`
respects cookies, so OAuth + magic-link flows work as-is. Verify the
post-login redirect resolves to the in-app URL scheme (`thepulse://`)
and not `https://the-pulse-sooty.vercel.app/`.

## Step 5 — TestFlight + Play Console submission

- [ ] App icons: regenerate from `/public/icon-maskable.svg`
      (1024×1024 source).
- [ ] Privacy nutrition label — declare KV, Supabase, Web Push usage.
- [ ] Encryption export: declare uses standard HTTPS only.
- [ ] Pass Type ID + APNs auth key uploaded.
- [ ] Internal TestFlight build run on at least one physical device.
- [ ] Play internal track with 1+ tester before promotion.

## Step 6 — release rules

- Web build keeps shipping every push to `main` via Vercel — that's
  the canonical channel.
- Native bumps happen on a release tag (`native-v0.1.0`) cut from
  `native/capacitor-shell` after the web build has been live for
  ≥48 h with no regression.
- Native push payloads MUST be backward-compatible with the existing
  Web Push payload shape (`src/lib/push-server.ts`) so a single
  publisher serves both channels.

## What we are deliberately NOT doing

- React Native rewrite — the web code already runs on every target;
  rewriting in RN burns months for negligible UX gain.
- Native-only routes / screens. The shell renders the existing PWA
  inside `WKWebView` / `WebView` — no parallel UI tree.
- Hard dependency on Capacitor APIs from the web build. Every native
  bridge is loaded via a feature-detect (`if (Capacitor?.isNativePlatform())`).
