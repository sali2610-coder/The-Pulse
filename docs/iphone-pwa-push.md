# iPhone PWA Web Push — Working Setup Guide

_Cheapest path. No Apple Developer Program required._

## What works on iPhone today

| Capability | Status |
|---|---|
| Web Push to installed PWA | ✅ Works on iOS 16.4+ |
| OS-level notification while app is closed | ✅ Works |
| OS-level notification while app is foregrounded | ❌ iOS suppresses by design; SW push event still fires |
| Quick-action buttons (food / transport) | ✅ Works (2 actions max — iOS cap) |
| Tap deep-link → /confirm/<externalId> | ✅ Works |
| Native APNs via Apple Developer | ❌ Phase 204+, blocked on paid Apple credentials |
| Native FCM (Android) | ❌ Out of current scope |

## User onboarding (Hebrew, in-app)

`Settings → "התראות באייפון (PWA)"` walks 4 explicit steps. Card
renders status pills + Hebrew hints from
`src/lib/iphone-push-onboarding.ts`:

1. Safari on iPhone (skipped on non-iOS).
2. Add to Home Screen (must succeed before iOS allows the prompt).
3. Notification permission (granted / denied / unsupported).
4. Live PushSubscription (browser + server agreeing).

When all four are done AND the app is foregrounded, the card surfaces
a Hebrew foreground explainer: *"באייפון, התראות לא מוצגות כשהאפליקציה
פתוחה בחזית. סגור את האפליקציה לפני בדיקת התראה."*

## What's blocked on Apple credentials (Phase 204+)

| Item | Why |
|---|---|
| Native iOS app on App Store | Requires Apple Developer Program ($99/yr) + App Store provisioning |
| APNs token-based push | Requires APNs Auth Key under Apple Developer Console |
| Push without "Add to Home Screen" | iOS restricts Web Push to standalone PWAs |
| Notifications while foregrounded | iOS architectural choice — only the SW push event fires |
| Lock-screen rich media (image preview) | Requires Notification Service Extension (App Store distribution) |

Phase 203 already shipped APNs + FCM adapter scaffolding gated on env
vars. The day credentials arrive, the only deltas are: real APNs HTTP/2
sender + wiring `sendNativePush` into `sendCategorizePush`.

## Manual QA — exact steps on iPhone

1. Open the deployed site in **Safari on iPhone** (not Chrome iOS; not
   in-app browser). iOS 16.4+ required.
2. Tap the share icon → **Add to Home Screen** → Add.
3. Open the app from the home-screen icon (not Safari). The URL bar
   should disappear (standalone mode).
4. Navigate to Settings. **"התראות באייפון (PWA)"** card should show:
   - Safari on iPhone — ✅ done
   - Add to Home Screen — ✅ done
   - Permission — current
   - Subscription — pending
5. Scroll to Tap-to-Pulse toggle below it. Tap "הפעל התראות".
   iOS shows the system permission prompt → Allow.
6. Toggle flips on. Onboarding card refreshes — all 4 steps done,
   header chip "התראות מוכנות".
7. **Close the app** (swipe up from bottom, swipe app away from
   the app switcher — NOT just send to background).
8. Trigger a test push: re-open Settings → Tap-to-Pulse →
   "שלח התראה לבדיקה". Wait 1-3 seconds.
9. Notification should appear on the iPhone home screen / lock screen.
10. Tap the notification → app re-opens to `/confirm/<externalId>`.

## Stuck loading recovery

Both the diagnostic card (Phase 200) and the toggle reconcile
(Phase 204) now wrap every async probe in a 5s timeout. If a probe
times out:

- Diagnostic banner: *"אבחון נעצר אחרי זמן ההמתנה. בדוק חיבור או נסה שוב."*
- Toggle falls through to `idle` state so the user can re-tap
  "הפעל התראות".

No infinite spinners.

## How to verify the foreground-fallback message

1. App fully installed + push registered.
2. Settings → Tap-to-Pulse → diagnostic open.
3. While the app is visible: gold-tinted Hebrew banner inside the
   diagnostic + onboarding card appears explaining iOS suppresses
   foreground notifications.
4. Background the app (home button) → ban­ner disappears on next
   diagnostic refresh.

## Sanity gates

| Gate | Result |
|---|---|
| typecheck | ✅ |
| lint | ✅ |
| test | ✅ 1016 (+8) |
| build | ✅ no warnings |
| perf:budget | ✅ 2722/2800 KB |
| a11y:audit | ✅ 0 findings |
