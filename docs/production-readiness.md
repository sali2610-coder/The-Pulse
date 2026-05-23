# The Pulse — Production Readiness Report (Phase 194)

_Date: 2026-05-23 · Branch: main · Head: post-Phase 193_

## 1. Audit Summary

| Area | Status | Notes |
|---|---|---|
| Env variables | ✅ Fixed | `.env.example` cleaned: removed Clerk + Plaid + `NEXT_PUBLIC_AUTH_ENABLED`. Added `NEXT_PUBLIC_SUPABASE_KEY` alias note. `NEXT_PUBLIC_EXPENSE_ENDPOINT` kept (still used by `postExpense` fan-out). |
| `next.config.ts` | ✅ Fixed | Removed dead `AUTH_URL`/`NEXTAUTH_URL` env injection (NextAuth excised in Phase 152b). Kept security headers. |
| Deprecated Next conventions | ✅ Clean | No `pages/_app`, `getServerSideProps`, etc. Middleware already renamed to `src/proxy.ts` (Phase 175). |
| Hydration | ⚠️ Low risk | `<html suppressHydrationWarning>` set at root. Store reads gated by `hasHydrated` in dashboard/analytics hot paths. 17 leaf components subscribe without explicit guard (deep forms/sheets) — they read Zustand defaults which match SSR defaults, so no mismatch in practice. |
| Server/client boundary | ✅ Clean | No server secrets imported into client trees. KV / VAPID_PRIVATE / WEBHOOK_SECRET appear only in `app/api/**` and comments. No `async` client components. No `"use server"` misuse. |
| localStorage SSR safety | ✅ Clean | All call sites either prefixed `window.localStorage.` or wrapped in `useEffect`. Setup-hub guards via `useEffect` + `queueMicrotask`. |
| Empty-state safety | ✅ Clean | Charts (`category-donut`, `balance-horizon`, `health-score-card`, etc.) are custom SVG with explicit zero-data branches. `CardsPressureCard` returns `null` when no card has pressure. No `recharts`/`d3`/`visx` in deps. |
| Mobile Safari | ✅ Hardened | `env(safe-area-inset-*)` honored globally, `-webkit-tap-highlight`, `-webkit-text-size-adjust`, `-webkit-overflow-scrolling`. `Intl.NumberFormat({ signDisplay })` avoided at module load (iOS < 15.4 RangeError). Numeric `inputMode="decimal"` + dedicated +/− toggle in `AnchorInput` since iOS numeric keypad lacks minus. |
| Production build | ✅ Clean | `npm run build` produces no warnings/errors. All routes typed (`ƒ Dynamic` for the data routes, `○ Static` for `/setup/shortcut`, `/setup/wallet`, manifest, `/_not-found`, `/debug-react`). Middleware: `ƒ Proxy`. |
| Bundle size | ✅ Within budget | `perf:budget`: totalKB 2527/2800, biggestKB 884/940, fileCount 83/100. ~273 KB headroom. |
| Console output | ✅ Clean | Build emits zero warnings. Runtime `console.info`/`warn`/`error` calls are all diagnostic (cloud-sync trace, auth state, foreign-cache detection) and gated by structured conditions — no React warnings, no Next warnings. |
| Tests | ✅ 840 / 840 | +4 over Phase 192. New: card-pressure burden (1387/8613), payment-source-outranks-installment, fixed/variable split, write-loop dep-array regression (Bug 1). |
| Lint / typecheck / a11y | ✅ Clean | ESLint flat config, tsc strict, custom a11y audit (img-no-alt + button-no-label) — zero findings. |

## 2. Remaining Risks

**R1 — Retry queue is in-memory only.** Failed cloud writes (offline, transient RLS) sit in a 200-bounded JS array. A page reload before reconnect loses them. _Mitigation today:_ Zustand persist still holds the local truth; next visibility tick re-attempts via diff. _Real fix:_ persist `retryQueue` to localStorage so writes survive a refresh.

**R2 — `RecurringRule.variable` is local-only.** Field exists in Zustand v9 + the form, but Supabase `recurring_rules` table has no column for it. Round-trip from cloud drops the flag (treats as fixed). _Real fix:_ Supabase migration `alter table recurring_rules add column variable boolean default false;` + add to `row-mapping.ts`.

**R3 — Service worker disables shell caching.** `public/sw.js` was deliberately reduced to push-only after past install-recoverability incidents. Cold loads on flaky networks therefore have no offline shell. _Mitigation:_ Vercel CDN + `/lite` fallback route. _Real fix:_ reintroduce a versioned shell cache with strict expiry once the recoverability story is automated.

**R4 — Two pre-Supabase ingress paths still exist.** `/api/webhooks/transactions` + KV state blob (`/api/state`). Both are scoped per user but live on Upstash, not Supabase. If KV is unprovisioned the webhook returns `{ persisted: false }` silently — easy to miss in monitoring. _Mitigation:_ Settings → `IntegrationInfo` surfaces config status.

**R5 — Single-canonical-host assumption.** Phase 61 pinned the OAuth flow to `the-pulse-sooty.vercel.app` to avoid Google `redirect_uri_mismatch`. Now removed from `next.config.ts` (NextAuth gone), but Supabase OAuth callbacks still need every preview host whitelisted, or the app must canonicalize at request time. _Verification needed:_ test sign-in from a Vercel preview deployment.

**R6 — Hydration mismatch latent risk.** 17 leaf components subscribe to `useFinanceStore` without explicit `hasHydrated` gating. They render Zustand initial defaults during SSR, then re-render after localStorage rehydrate. Today the defaults are stable (empty arrays / zero), so no visible mismatch, but introducing a non-default initial value would surface it.

## 3. Technical Debt

| Item | Severity | Cost to fix |
|---|---|---|
| Stale `lite/route.ts` + `reset/route.ts` inline HTML (1.4 KB each, ad-hoc CSS) | Low | 1 day to template |
| `cloud-store.ts` casts every Supabase client call through `as unknown as { ... }` to satisfy TS — repeated 5× | Low | 0.5 day to extract typed wrappers |
| `useCloudSync` is one ~700-line file holding ownership, hydration, write loop, retry. Hard to reason about under context. | Medium | 1–2 days to split into 3 hooks |
| No CI workflow file in repo. All gates run locally only. | Medium | 0.5 day to wire GitHub Action |
| `next.config.ts` headers have no CSP. Adding one safely (Framer Motion uses `style-src 'unsafe-inline'`) requires audit. | Medium | 1 day |
| Service Worker has no version-pinning monitor; bumping `SW_VERSION` is manual. | Low | 0.5 day |
| `tests/cloud-write-diff.test.ts` regex-scans the use-cloud-sync source to assert dep array — brittle to formatting changes. | Low | Acceptable for now |

## 4. Scalability Concerns

- **KV ZSET unbounded per device.** `sally:tx:<deviceId>` ZADDs with a 90-day TTL on each row, but the set itself isn't trimmed. A heavy user (~50 tx/day × 90 days = 4500 entries) is fine; a year of automation backlog could hit Upstash limits. _Action:_ add periodic `ZREMRANGEBYSCORE` for entries older than 90 days.
- **Supabase row counts.** Each entity table is `user_id`-indexed and RLS-gated. Modeled for 5–10 K rows per user; 50 K+ would need pagination on `fetchAllEntities` (currently `SELECT *`).
- **Push subscription drift.** No cleanup job for stale `sally:push:<deviceId>` entries (`gone=true` responses already DELETE in-line, but uninstalled PWAs that never receive a push won't be detected). Acceptable while user base is small.
- **Single Supabase region.** Latency for non-EU users could exceed 200 ms on cold reads. Vercel Edge functions partly hide this but the entity fetch is a 5-query parallel call to one origin.
- **Web Push fan-out is sequential per device.** A user signed in on 4 devices would walk subscriptions serially. Acceptable today; would need batching at >50 devices.

## 5. Recommended Next Priorities

1. **Persist `retryQueue` to localStorage** (R1). Survives a refresh, drains on next mount. ~2 hours.
2. **Supabase `variable` column migration** (R2). One DDL + a `row-mapping` line. Unlocks cross-device fixed/variable preference. ~1 hour.
3. **CI workflow file.** Run typecheck + lint + test + build + perf:budget + a11y:audit on every PR. Catches dep-array / migration regressions before they reach `main`. ~2 hours.
4. **Split `useCloudSync` into focused hooks** (debt). `useCloudAuth`, `useCloudHydration`, `useCloudWriteLoop`. Makes future bugs like Bug 1 obvious by reading the deps in isolation. ~1 day.
5. **Periodic KV trim cron job** (scalability). Vercel Cron or external scheduler hits `ZREMRANGEBYSCORE`. ~3 hours.
6. **Visual regression baseline.** Playwright already in repo; add screenshot diff for `/`, `/lite`, `/setup/wallet`. ~half day.
7. **Add CSP header** (debt). Audit Framer Motion inline styles, narrow `style-src`. ~1 day.

## 6. Acceptance — Pre-Push Gates

```
typecheck   ✅
lint        ✅
tests       ✅ 840/840
build       ✅ no warnings
perf:budget ✅ 2527/2800 KB · 83/100 files · 884/940 biggest
a11y:audit  ✅ 0 findings
```

— end of report —
