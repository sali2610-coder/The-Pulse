# Phase 152 — Supabase Verification Protocol

Run this ONCE before signing off the acceptance checklist
(`phase-152-acceptance.md`). Establishes the cloud truth layer is
healthy before exercising the end-to-end flows.

## A. Pre-flight (Supabase dashboard)

### A1. Schema applied

In Supabase SQL Editor:

```sql
select tablename
from   pg_tables
where  schemaname = 'public'
order  by tablename;
```

Expect: `accounts`, `backups`, `expense_entries`, `incomes`, `loans`,
`recurring_rules`, `sync_mutations`. Seven rows.

### A2. RLS enabled on every entity table

```sql
select relname, relrowsecurity
from   pg_class
where  relnamespace = 'public'::regnamespace
  and  relname in ('expense_entries','accounts','recurring_rules',
                   'loans','incomes');
```

Expect `relrowsecurity = true` for all five rows.

### A3. Policies attached

```sql
select tablename, policyname, cmd, qual
from   pg_policies
where  schemaname = 'public'
order  by tablename, policyname;
```

Expect for each of the five entity tables exactly four rows:
`owner_select`, `owner_insert`, `owner_update`, `owner_delete`.
`qual` must read `(auth.uid() = user_id)` for every row.

### A4. Google OAuth enabled

Authentication → Providers → Google → Status: **Enabled**.

Authentication → URL Configuration → Site URL = production origin.

Authentication → URL Configuration → Redirect URLs include:
- production origin (e.g. `https://the-pulse.vercel.app`)
- `https://the-pulse.vercel.app/`  (trailing slash variant)
- `http://localhost:3000/`         (for local dev)

If any are missing, OAuth returns `redirect_uri_mismatch`.

### A5. Vercel env vars

Project → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://wmqxgljqnykwywkchznl.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_…`

Both in **Production**, **Preview**, **Development**.

After adding, redeploy.

## B. Browser DevTools verification

Open production URL in a fresh window with DevTools open.

### B1. Console — sanity check

No red errors. Should see no Supabase-related warnings before login.

### B2. Network — Supabase project reachable

In Network tab, filter on `wmqxgljqnykwywkchznl.supabase.co`. Before
sign-in: zero requests. (The client only fires once `signInWithGoogle`
or `getSession()` runs.)

### B3. Application → Local Storage

Key `sally.supabase.session` may or may not exist depending on whether
a previous session lingered. Delete it if testing from scratch.

### B4. Initiate login

Settings tab → "סנכרון ענן" card → tap "חבר את Google לסנכרון ענן".

Network: request to `…/auth/v1/authorize?provider=google&…` →
302 → redirect to `accounts.google.com/o/oauth2/v2/auth?…`.

If you see a different host (e.g. `/rest/v1/…`), the env var is
wrong — Supabase URL must be base only, never end with `/rest/v1`.

### B5. Post-redirect

After picking Google account, redirected back. URL fragment briefly
contains `access_token=…&refresh_token=…&expires_in=3600` — Supabase
client picks it up via `detectSessionInUrl: true` and strips the
fragment.

Application → Local Storage:
`sally.supabase.session` now exists, contains `{access_token, …}`.

### B6. CloudSyncCard

Settings tab → "סנכרון ענן" card now shows green status badge.

Read the live values:
- Status badge: `מסונכרן` (or `מסנכרן` briefly during first pull).
- `משתמש ענן`: first 8 chars of the Supabase user id.
- `עדכון אחרון`: just-now timestamp.
- `RLS`: `תקין`.
- `שגיאה אחרונה`: `—`.

If `RLS` shows `נכשל`, click the per-row inspector in the Network tab:
look for a 401 or 42501 response from any `/rest/v1/…?select=id` call.
That row's table failed RLS — re-check policies for that table in A3.

### B7. Token refresh

Supabase issues 1h tokens. Verify the client auto-refreshes:

```js
const s = await window.__SUPABASE_DEBUG__?.auth.getSession();
```

(If that helper isn't exposed, inspect via the LocalStorage entry
`sally.supabase.session.expires_at` — should be ~1h ahead of `Date.now()/1000`.)

## C. RLS isolation (two-account test)

This is the critical security verification.

### C1. Setup USER_A

1. Sign in as USER_A (Gmail #1).
2. Add 5 expenses, 2 accounts, 1 recurring rule.
3. Note the Supabase user id from the CloudSyncCard.

### C2. Verify USER_A data exists in DB

Supabase SQL Editor (runs as service role):

```sql
select count(*) from public.expense_entries  where user_id = '<USER_A_ID>';
select count(*) from public.accounts          where user_id = '<USER_A_ID>';
select count(*) from public.recurring_rules   where user_id = '<USER_A_ID>';
```

Expect: 5, 2, 1.

### C3. Switch to USER_B

1. Sign out via "נתק" button.
2. Open Pulse in a fresh private window or different device.
3. Sign in as USER_B (Gmail #2).

### C4. CloudSyncCard observations

- `משתמש ענן`: USER_B's id (NOT USER_A's).
- Cloud counts on every row: `0 / 0` or `0 / N` (with N matching
  whatever USER_B had locally before sign-in).
- Dashboard shows NONE of USER_A's data.

### C5. Network-level RLS check

In Network tab, find a request like
`…/rest/v1/expense_entries?select=*`.

Response body: array. Length === USER_B's row count (likely 0).
Never contains a row with `user_id = <USER_A_ID>`.

### C6. Direct attack attempt (sanity check)

In DevTools console, try to read USER_A's rows from USER_B's session:

```js
const { data, error } = await window.__SUPABASE_DEBUG__.from('expense_entries')
  .select('*')
  .eq('user_id', '<USER_A_ID>');
console.log({ data, error });
```

(If `__SUPABASE_DEBUG__` isn't exposed, reproduce with a tampered
filter — the result must still be empty.)

Expect: `data = []`. RLS strips out USER_A's rows even though the
query syntax tried to fetch them. If `data` returns rows belonging to
USER_A, **STOP** — RLS is broken; do not sign off the phase.

## D. Hydration order verification

In B6, observe the sequence in Network tab after sign-in:

1. `…/auth/v1/user` → 200 (Supabase confirms session).
2. Five parallel `…/rest/v1/<table>?select=*` requests (entity pull).
3. (Optional) follow-up upserts when local has data that wasn't in
   the cloud yet.

If step 2 fires BEFORE step 1, that's a regression — file a bug.
The hook is wired so `verifyCloudAccess()` precedes `fetchAllEntities()`.

## E. Empty-state push verification

To prove the "cloud < local → push local up" branch:

1. Sign in as USER_A.
2. Confirm cloud counts > 0 (CloudSyncCard).
3. In Supabase SQL Editor, run:

   ```sql
   delete from public.expense_entries where user_id = '<USER_A_ID>';
   delete from public.accounts         where user_id = '<USER_A_ID>';
   delete from public.recurring_rules  where user_id = '<USER_A_ID>';
   delete from public.loans            where user_id = '<USER_A_ID>';
   delete from public.incomes          where user_id = '<USER_A_ID>';
   ```

4. Sign out via "נתק".
5. Sign back in as USER_A.
6. Dashboard data is **PRESERVED** locally. CloudSyncCard cloud
   counts briefly show 0, then climb back to match local as the
   push-local branch fires.
7. Re-run the SELECT counts in SQL Editor. Rows reappeared.

If the dashboard goes empty after sign-in, the reconcile branch
mis-fired. **STOP** — investigate before signing off.

## Sign-off

Every section A–E passing == Supabase truth layer verified. Proceed
to the iPhone PWA acceptance scenarios in `phase-152-acceptance.md`.

Tester:   ___________________________
Date:     ___________________________
Deploy:   ___________________________
Result:   ___ PASS  ___ FAIL
