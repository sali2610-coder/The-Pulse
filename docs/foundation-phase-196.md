# Phase 196 — Native + External-Service Foundation

_Status: scaffolding shipped. No user-visible product features added._

This phase plants the architectural seams the next round of work needs:
receipt OCR, scheduled reminders, Hebrew-holiday awareness, Apple +
Google Wallet pass payloads, and a Capacitor native-shell checklist.
Everything is additive — no existing module, route, store action,
auth flow, RLS policy, or financial calculation was touched.

## 1. Receipt OCR foundation

### Files added
- `src/lib/ocr/types.ts` — `OcrProvider`, `OcrInput`, `OcrResult`,
  `OcrError`, `OcrOutcome`.
- `src/lib/ocr/manual.ts` — paste-text provider, always-ready fallback.
- `src/lib/ocr/parser.ts` — `parseReceiptText(text) → ReceiptCandidate`
  (amount, merchant, occurredAt, currency, confident).
- `src/lib/ocr/index.ts` — registry + facade
  (`listOcrProviders`, `getOcrProvider`, `pickReadyOcrProvider`,
  `_registerOcrProviderForTests`).
- `src/components/settings/receipt-scan-card.tsx` — collapsed-by-default
  Settings card. Paste text → parse → display extracted fields.
  **No automatic addExpense call** — the user copies values to the
  regular new-expense form.
- `tests/ocr.test.ts` — 11 specs.

### Status
- **Manual provider** — ready, registered, used by the UI.
- **Tesseract.js** — planned. Adapter would lazy-load the WASM bundle
  on first use, register as `"tesseract"`, gate `isReady()` on
  successful import. Out of scope today (5+ MB cold dep).
- **Google Cloud Vision** — planned. Adapter would POST to a future
  `/api/ocr/scan` server route holding the service-account key.
  Out of scope today (paid + needs GCP setup).

## 2. Push reminder scheduler foundation

### Files added
- `src/lib/reminders/types.ts` — `Reminder`, `ReminderKind`
  (`unpaid_recurring`, `high_card_pressure`, `budget_approaching`,
  `stale_anchor`), `ReminderSeverity`, `ReminderThresholds`,
  `DEFAULT_THRESHOLDS`.
- `src/lib/reminders/evaluators.ts` — pure `evaluateReminders(input)`
  function over a store snapshot.
- `src/lib/reminders/index.ts` — facade.
- `tests/reminders.test.ts` — 9 specs.

### Status
- **Pure evaluator** — ready. Reuses existing `projectMonth`,
  `buildCardPressure`, `detectStaleAnchors` so reminders inherit the
  same financial-engine truth as the dashboard.
- **Dispatcher** — NOT wired. The existing categorize-prompt Web Push
  pipeline (`src/lib/push-server.ts`) is deliberately untouched.
  Next step: a server-side cron (Vercel Cron) that walks evaluators
  daily + a KV-backed idempotency store keyed by `reminder.key`.
- **Idempotency contract** — `reminder.key` is shaped
  `<kind>:<entityId>:<monthKey>` so a re-run inside the same month
  is a no-op for the dispatcher.

## 3. Hebrew holiday / calendar foundation

### Files added
- `src/lib/calendar/hebrew-holidays.ts` — hand-curated table of major
  observances for 2025–2027. `listHolidays`, `holidaysInRange`,
  `isHolidayToday`, `nextHoliday`.
- `src/lib/calendar/index.ts` — facade.
- `tests/hebrew-holidays.test.ts` — 7 specs.

### Status
- **Static table** — ready. Each entry carries `id`, label,
  Gregorian start, durationDays, `spendImpact` ("high" | "moderate"
  | "low") for future analytics tinting.
- **Maintenance rule** — extend a year forward by copying the prior
  year and shifting per Hebcal. Adding a test per year guarantees the
  table doesn't silently rot.
- **No external API**. `hebcal` npm package considered but rejected
  (bundle cost + an unbroken table is honest about its scope).

## 4. Apple / Google Wallet Pass readiness

### Files added
- `src/lib/wallet-pass/types.ts` — `ApplePassPayload`,
  `GoogleWalletPassPayload`, `WalletPassEnvelope`,
  `WalletPassSnapshotData`.
- `src/lib/wallet-pass/builder.ts` — pure
  `buildWalletPassEnvelope({ snapshot, config? })` → produces both
  payloads.
- `src/lib/wallet-pass/index.ts` — facade.
- `tests/wallet-pass.test.ts` — 6 specs.

### Status
- **Payload contracts + pure builder** — ready and unit-tested.
- **Signing pipeline** — NOT shipped. Apple PKPass needs an Apple
  Developer Pass Type ID cert + WWDR cert + manifest hashing + zip
  with `signature` blob; Google Wallet needs a service-account-signed
  JWT against a created class. Both require accounts + creds outside
  this repo. The future server route (`/api/wallet/pass`) wraps the
  signer around the builder.

## 5. Capacitor wrapper readiness

### Files added
- `docs/native-wrapper-checklist.md` — cold-start checklist for the
  native shell (prerequisites, install commands, plugin matrix, auth
  handshake notes, TestFlight + Play Console submission gates,
  release rules).

### Status
- **Documentation only.** Per the spec: no native code in this
  environment.

## Stability gates

| Gate | Before | After |
|---|---|---|
| typecheck | ✅ | ✅ |
| lint | ✅ | ✅ |
| unit tests | 840 | **873** (+33) |
| build | ✅ no warnings | ✅ no warnings |
| perf:budget | 2527 / 2800 KB | **2533** / 2800 KB (+6 KB) |
| a11y:audit | 0 findings | 0 findings |

No existing test changed. Existing dashboard, settings, finance
engine, auth, RLS, Supabase sync, push, KV, webhook routes — all
untouched.

## What still requires native / external provider setup

| Capability | Blocked on |
|---|---|
| Tesseract.js OCR | Bundle-size decision + lazy-load wiring. |
| Google Cloud Vision OCR | GCP service account + `/api/ocr/scan` server route. |
| Real reminder push delivery | Vercel Cron + KV idempotency store. No code change yet to push-server.ts. |
| Apple Wallet `.pkpass` install | Apple Developer Pass Type ID cert + WWDR cert + signer pipeline. |
| Google Wallet "Save to phone" | Google Wallet API issuer ID + service-account JWT signer. |
| Native iOS / Android shell | macOS + Xcode + Apple Dev account + Play Console + Capacitor install (see [native-wrapper-checklist.md](./native-wrapper-checklist.md)). |

## What changed in the web app

- `src/components/settings/settings-tab.tsx` — appended the
  collapsed-by-default `ReceiptScanCard` at the bottom of Settings.
  No layout shift to other cards.

Nothing else touched.
