# Cloud Architecture (Phase 152)

## Goal

Make Supabase the source of truth for user entity data, while keeping every
hard-won safety guarantee from Phases 71 / 126 / 149 / 151 intact.

## Identity model

There are TWO authentication systems running side by side:

| System | Purpose | Server access |
|---|---|---|
| NextAuth (Google OAuth via KV adapter) | Sessions for `/api/state`, webhooks, push, claim-device | `auth()` server helper |
| Supabase Auth (Google OAuth) | RLS principal for entity tables | client-side `supabase.auth.getSession()` |

Until a future migration unifies them, the user signs into BOTH:

- NextAuth — gates Vercel KV blob, iOS Shortcut webhook authorization.
- Supabase — issues the JWT that RLS checks `auth.uid() = user_id` against.

The two user ids are independent. KV state continues to be scoped by NextAuth
user id; Supabase entity rows are scoped by Supabase user id. There is no
auto-migration between them — the Supabase cloud-sync layer is purely additive.

## Cloud truth = Supabase

When the user is signed into Supabase, the cloud-sync layer (`useCloudSync`)
is activated:

1. **Health check.** `verifyCloudAccess()` runs a `SELECT id LIMIT 0` against
   every entity table to confirm both reachability and that the RLS principal
   matches `user_id`. Surfaced in the sync-health card.

2. **Read.** `fetchAllEntities()` selects every row the RLS principal owns.
   No `user_id` filter is required client-side — RLS enforces it server-side.

3. **Reconcile.** Compare cloud richness vs local richness (entries + rules +
   accounts + loans + incomes; monthlyBudget excluded as it lives in KV only):

   - `cloud > local` → apply cloud over local, after capturing a local
     safety snapshot.
   - `cloud < local` → push local up via `pushAllEntities()` (idempotent
     upsert). **This is the critical empty-cloud protection: empty cloud
     never replaces rich local.**
   - `cloud === local` → noop.

4. **Write loop.** After hydration, a debounced subscriber pushes any
   in-memory store change up via per-entity `upsert()` on the supabase
   client. RLS rejects any row whose `user_id` doesn't match the JWT.

## Security boundary

- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the ONLY
  credentials shipped to the browser. Both are RLS-gated by definition.
- `SUPABASE_SERVICE_ROLE_KEY` is **NOT** used anywhere in this codebase.
  Service-role would bypass RLS — see Phase 152 commit for why we
  explicitly rejected that path.
- All entity tables in `supabase/migrations/0001_init.sql` have RLS
  enabled with `owner_select`, `owner_insert`, `owner_update`,
  `owner_delete` policies keyed on `auth.uid() = user_id`. Verified via
  the `verifyCloudAccess()` health check on every sign-in.

## Empty-state protection (defense in depth)

Three layers, all of which must fail for empty cloud to overwrite rich
local:

1. **Client reconcile (`useCloudSync`)** — `cloudR < localR` path pushes
   instead of apply. (Phase 152)
2. **`remote-state-sync` richness guards** — block empty remote on rich
   local for the legacy KV /api/state flow. (Phase 149)
3. **Server-side anti-empty PUT** — `/api/state` PUT rejects empty body
   when the existing blob is rich. (Phase 71)

## Hydration order

```
1. SSR shell renders welcome screen OR app shell based on NextAuth session.
2. Zustand persist hydrates from localStorage → hasHydrated flips true.
3. useRemoteStateSync runs: GET /api/state (KV).
   - Guarded by Phase 149 richness checks.
4. useCloudSync runs (additive — only if Supabase configured + signed in):
   - verifyCloudAccess().
   - fetchAllEntities().
   - Reconcile cloud vs local.
   - Subscribe for outbound writes.
5. Dashboard renders. Loading curtain only during step 4 hydrating window.
```

## What ISN'T cloud-synced yet

- `monthlyBudget`, `lastSyncedAt`, `audioEnabled` — these live in the KV state
  blob, not in a Supabase table. Adding them is a future schema migration.
- `RecurringStatus[]` — currently KV-only.
- Backups, mutation audit log — local + KV only.

These remain in the existing KV flow and are not affected by sign-in to
Supabase.
