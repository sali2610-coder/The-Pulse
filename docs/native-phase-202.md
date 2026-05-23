# Phase 202 — Native Shell Foundation

_Status: foundation shipped. Capacitor wired, abstraction layer in
place, native projects NOT yet generated on the repo._

## Scope

* Capacitor 8.x installed.
* `capacitor.config.ts` at repo root, app id `com.thepulse.app`,
  display name `The Pulse`.
* Native abstraction layer at `src/lib/native/` (platform, lifecycle,
  haptics, secure-storage, push).
* `<NativeShellProvider />` mounted from `src/app/providers.tsx`.
* `/ios` + `/android` ignored from git — generated locally only.
* Web app on Vercel is fully unchanged: still dynamic Next.js
  runtime, no `output: "export"`, no API route rewrites, no auth
  change, no Supabase schema change, no financial-engine touch.

## Files added

### Compute / abstraction
- `src/lib/native/platform.ts` — `detectPlatform()` → `"ios" | "android" | "pwa" | "web"`, plus `isNative` / `isIOS` / `isAndroid`.
- `src/lib/native/lifecycle.ts` — `onLifecycle(listener)` over `appStateChange` (native) or `visibilitychange` (web).
- `src/lib/native/haptics.ts` — `nativeTap` / `nativeSoft` / `nativeSuccess` that delegate to Taptic Engine when native, fall through to existing `src/lib/haptics.ts` on web.
- `src/lib/native/secure-storage.ts` — `getSecure` / `setSecure` / `removeSecure` async API. Today stores under `sally.secure.v1:<key>` in localStorage; Phase 203 swaps the backend to Keychain.
- `src/lib/native/push.ts` — `registerNativePush()` placeholder + `nativePlatformLabel()`.
- `src/lib/native/index.ts` — single facade.

### React
- `src/components/app/native-shell-provider.tsx` — boot-time wiring.
  No-ops on web. Mounted from `src/app/providers.tsx`.

### Config
- `capacitor.config.ts` at repo root.
- `.gitignore` extended with `/ios` and `/android`.

### Tests
- `tests/native-foundation.test.ts` — 13 jsdom specs covering
  platform detection, lifecycle dispatch, secure-storage round-trip,
  push placeholder.

## What is NOT yet implemented

| Capability | Status |
|---|---|
| iOS Xcode project | NOT generated. Run `npx cap add ios` locally on macOS (requires Cocoapods). |
| Android Studio project | NOT generated. Run `npx cap add android` locally (requires Android SDK + Gradle). |
| APNs token registration | Placeholder (`registerNativePush` returns `registration_failed`). |
| FCM token registration | Same. |
| Server route `/api/push/subscribe-native` | NOT added. |
| Secure storage backed by Keychain / EncryptedSharedPreferences | NOT added — falls through to localStorage. |
| App icon assets (`AppIcon.appiconset`, `mipmap-*`) | NOT added — use `npx capacitor-assets generate` after step 1. |
| Splash launch images | NOT added — Capacitor defaults to backgroundColor only. |
| Native Wallet Pass install (PKPass) | Out of scope; tracked in `docs/native-wrapper-checklist.md`. |
| Vercel build output `out/` | Web app stays dynamic. `webDir: "out"` is set only so a future static-export branch can populate it. |

## How to bring up iOS locally (when on macOS with Xcode + Cocoapods)

```sh
# 1. Install Cocoapods if missing
brew install cocoapods

# 2. Generate the Xcode project
npx cap add ios

# 3. (optional) Generate app icons + splash from a 1024×1024 source.
#    Drop the source at resources/icon.png + resources/splash.png first.
npx @capacitor/assets generate --ios

# 4. Open Xcode
npx cap open ios
```

The native build serves the Vercel-hosted web by default. To use the
production domain inside the shell, set
`server.url` on `capacitor.config.ts`:

```ts
const config: CapacitorConfig = {
  // ...
  server: {
    url: "https://the-pulse-sooty.vercel.app",
    cleartext: false,
  },
};
```

Run `npx cap sync ios` after any config change.

## How to bring up Android locally

```sh
npx cap add android
npx @capacitor/assets generate --android
npx cap open android
```

Requires Android Studio Koala+ with SDK 34/35 installed.

## Lifecycle integration

Existing sync triggers (`useAutoSync` visibilitychange listener,
`use-cloud-sync` reconnectTick) keep firing on web exactly as today.
The new `onLifecycle()` dispatcher is the second entry point future
native code plugs into — `appStateChange` on iOS/Android maps to the
same `resumed` / `backgrounded` events without duplicating the
financial reconcile pipeline (it just notifies; the actual sync still
runs from the existing handlers via the same visibilitychange event,
which Capacitor's WKWebView also surfaces).

No duplicate transactions are created: every sync path passes through
`addExpense({ externalId, source: "auto" })` which already dedupes
on `externalId` via `findFuzzyDuplicate`.

## Quality gates

| Gate | Result |
|---|---|
| typecheck | ✅ |
| lint | ✅ |
| test | ✅ (+13 specs) |
| build | ✅ no warnings |
| perf:budget | ✅ (well under cap; native deps are dead code on the web bundle thanks to lazy `import()` in the platform-gated paths) |
| a11y:audit | ✅ 0 findings |

## Acceptance against the brief

- ✅ Vercel web app still builds (no `next.config.ts` change).
- ✅ Current PWA still works (NativeShellProvider is a no-op on web).
- ✅ No financial calculation changes.
- ✅ No auth / Supabase regression — neither was touched.
- ✅ Native foundation exists + documented.
- ✅ Ready for Phase 203: real native push (`registerNativePush` is
  the seam to fill).

## Phase 203 punch list

1. Run `npx cap add ios` on a Mac with Cocoapods, commit the
   `/ios` directory in a dedicated `native/ios-initial` PR.
2. Add `@capacitor/push-notifications`. Wire `registerNativePush()`
   in `src/lib/native/push.ts`:
   - request permission
   - register
   - subscribe to `registration` for token
   - POST `{ token, platform }` to a new
     `/api/push/subscribe-native` route
3. Server stores token under `sally:push-native:<userId>:<platform>`.
4. Update `sendCategorizePush` to fan out to native subscribers
   first (APNs / FCM) and to Web Push as fallback.
5. Generate app icons via `@capacitor/assets` from a 1024×1024 source.
6. TestFlight internal build.
