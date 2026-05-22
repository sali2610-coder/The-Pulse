# Phase 152 — Manual Acceptance Checklist

Cloud-truth via Supabase + RLS. Each scenario must pass on a real
device against production (or a preview deploy with the same Supabase
project).

## Preconditions

- [ ] Vercel env vars set:
  - `NEXT_PUBLIC_SUPABASE_URL=https://wmqxgljqnykwywkchznl.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…`
- [ ] Supabase project has migration `0001_init.sql` applied. Verify in
      SQL editor: `select tablename from pg_tables where schemaname='public';`
      returns expense_entries, accounts, recurring_rules, loans, incomes,
      backups, sync_mutations.
- [ ] Supabase Auth → Providers → Google enabled, redirect URLs include
      the production origin + `/` and `http://localhost:3000/` for dev.
- [ ] Two test Google accounts available. Treat them as USER_A and USER_B.

---

## 1. Google login (clean-slate first run)

- [ ] Open production URL in a fresh private window.
- [ ] Settings tab → "סנכרון ענן" card shows: "חבר את הנתונים לענן"
      with the "חבר את Google לסנכרון ענן" CTA.
- [ ] Tap CTA → Google account chooser appears → pick USER_A.
- [ ] After redirect, "סנכרון ענן" card shows green status badge
      "מסונכרן" (or "מסנכרן" briefly) and `משתמש ענן` slice shows the
      first 8 chars of USER_A's Supabase user id.
- [ ] `RLS` row shows `תקין`.
- [ ] No console errors. No toast errors.

PASS criteria — RLS verified per-table, cloud session live.

## 2. Add data

While signed in as USER_A:

- [ ] Settings → add a bank account (`Discount`, anchor `5000`).
- [ ] Settings → add a credit card (`CAL`, last4 `1234`, billing 25,
      payment 2).
- [ ] Settings → add an income (`שכר`, 18000, day 1).
- [ ] Settings → add a loan (`מכונית`, 1500/m, day 5).
- [ ] Settings → add a recurring expense (`צמיגים`, transport, 400,
      day 10, paymentSource=card, linkedCardId=CAL).
- [ ] Dashboard → "+חדשה" → add an expense (`Shufersal`, 250, food,
      credit, 3 installments).
- [ ] After each add, settings "סנכרון ענן" `עדכון אחרון` timestamp
      ticks within ~2 seconds (debounce is 1.5s).
- [ ] Counts shown on the sync card: `ענן/מקומי` rows match exactly
      after each add.

Open Supabase SQL editor → run
`select id from public.expense_entries where user_id = '<USER_A_id>'`
→ row count matches the local entries count.
Same query against the other entity tables → same parity.

PASS criteria — every write reached cloud via RLS.

## 3. iPhone PWA lifecycle

iPhone standalone PWA has no refresh button. Real acceptance is the
iOS lifecycle itself. Run every sub-step on a physical iPhone with
The Pulse installed via "Add to Home Screen".

### 3a. Cold relaunch from app switcher

- [ ] After step 2, swipe up from the home indicator to open the app
      switcher.
- [ ] Swipe the Pulse card up off the top — kills the WebKit
      process entirely.
- [ ] Tap the Pulse icon on the home screen.
- [ ] App launches fresh. Dashboard hydrates with EXACTLY the same
      data added in step 2 — accounts, card, recurring rule, entries,
      income, loan.
- [ ] Loading curtain "טוען נתונים מהענן" may flash briefly, then
      dismisses. Never longer than ~2s.
- [ ] Sync card shows `מסונכרן` with matching ענן/מקומי counts.

### 3b. Lock screen round-trip

- [ ] With Pulse open in the foreground, press the side button to
      lock the phone.
- [ ] Wait ~30 seconds.
- [ ] Unlock the phone (Face ID / passcode). Pulse is in front again.
- [ ] No "empty" flash, no curtain. Data is identical to before lock.
- [ ] Sync card timestamp updates within ~2s of unlock (visibilitychange
      triggers a re-sync).

### 3c. App switch round-trip

- [ ] Swipe up halfway to expose the app switcher (don't kill the app).
- [ ] Open Messages / Safari / any other app. Stay there for ~60s.
- [ ] Swipe up and return to Pulse.
- [ ] No empty flash, no curtain. Data unchanged.
- [ ] Sync card `עדכון אחרון` ticks within ~2s of return.

### 3d. Background + add data on another device

- [ ] Send Pulse to background (home indicator swipe).
- [ ] On a SECOND device signed in as USER_A, add one expense.
- [ ] Wait ~3s for the second device to push to Supabase.
- [ ] Return to Pulse on the iPhone (foreground).
- [ ] The new expense appears within ~2s without any manual action.

PASS criteria — iPhone PWA preserves data across every iOS lifecycle
transition AND pulls fresh cloud data on resume.

## 4. Sign out / sign in (same Google)

On the iPhone PWA:

- [ ] Settings → "סנכרון ענן" card → "נתק" button.
- [ ] Card reverts to the "חבר את Google" CTA state.
- [ ] Settings → AuthCard NextAuth "התנתק" button (separate flow).
- [ ] Kill Pulse from the app switcher.
- [ ] Reopen Pulse from the home-screen icon.
- [ ] Welcome / sign-in surface renders.
- [ ] Tap "חבר את Google לסנכרון ענן" → pick the SAME USER_A account.
- [ ] Dashboard hydrates with the same data added in step 2 — every
      account, every entry, the recurring rule, all of it.
- [ ] No manual restore button tapped. No "מצב ריק" warning.

PASS criteria — data follows the Google identity, not the device.

## 5. PWA reinstall (cloud auto-hydrate from zero)

The hardest case — local cache is gone, only Supabase remembers the
user.

- [ ] On the iPhone, long-press the Pulse home-screen icon → "Remove
      from Home Screen" → confirm.
- [ ] Verify the icon is gone. Open Safari, browse anywhere to confirm
      no Pulse session is lingering.
- [ ] Reopen the production URL in Safari.
- [ ] Add the app back to the home screen (Share → "Add to Home
      Screen").
- [ ] Launch from the new home-screen icon.
- [ ] Sign in to Supabase as USER_A.
- [ ] Dashboard hydrates with the FULL dataset added in step 2 within
      ~2 seconds. Loading curtain may flash, then dismisses.
- [ ] Sync card cloud counts equal the local counts.
- [ ] No restore button tapped. No "מצב ריק" warning.

PASS criteria — cloud truth survives a complete local wipe. The user
recovers everything by signing in.

## 5b. Cross-device convergence

- [ ] On a SECOND device (browser or second iPhone), sign in to
      Supabase as USER_A.
- [ ] Dashboard hydrates with the same data as device #1.
- [ ] Add one expense on device #2 (e.g. `קופיקס`, 18, food, cash).
- [ ] Wait ~3 seconds.
- [ ] On device #1: send Pulse to background, then return to it.
- [ ] The new `קופיקס` expense appears on device #1 within ~2s.

PASS criteria — cloud is canonical, devices converge without manual
intervention.

## 6. No manual restore needed

- [ ] Anywhere in the four flows above, did "השתמש בגיבוי" / "שחזר
      גיבוי" / "מומלץ לשחזר" appear as a primary action?  →  Expected
      answer: NO.
- [ ] Settings → "גיבוי ושחזור" card still exists but its restore
      controls are under "אפשרויות מתקדמות" only.
- [ ] Login + refresh require ZERO restore taps.

PASS criteria — restore is only for emergency recovery, not for
normal login.

## 7. Empty-state cannot overwrite rich

Three sub-cases. All must hold.

### 7a. Empty cloud, rich local → push local up

- [ ] Sign out of Supabase entirely.
- [ ] In Supabase SQL editor, run:
      `delete from public.expense_entries where user_id = '<USER_A_id>';`
      `delete from public.accounts where user_id = '<USER_A_id>';`
      `delete from public.recurring_rules where user_id = '<USER_A_id>';`
      `delete from public.loans where user_id = '<USER_A_id>';`
      `delete from public.incomes where user_id = '<USER_A_id>';`
- [ ] On the device that still has rich local data, sign back in to
      Supabase as USER_A.
- [ ] Dashboard data STAYS — rich local is NOT replaced by empty cloud.
- [ ] Sync card briefly shows `מסנכרן` then `מסונכרן`. Cloud counts
      now match local counts.
- [ ] Re-run the SQL counts. The rows reappeared.

PASS criteria — the rule "cloud < local → push local up" fired,
empty cloud never overwrote rich local.

### 7b. Empty local, rich cloud → apply cloud

- [ ] On a third device / private window with NO local data, sign in
      as USER_A (data from 7a is now back in cloud).
- [ ] Dashboard hydrates with the full dataset within ~2 seconds.
- [ ] Sync card shows ענן counts > 0 and מקומי counts matching after
      apply.

PASS criteria — first-device-on-account flow brings cloud truth
down.

### 7c. Other-user RLS isolation

- [ ] Sign in as USER_B (different Google account) in a fresh window.
- [ ] Dashboard hydrates EMPTY (USER_B has no data of their own).
- [ ] Sync card cloud counts are all 0 for USER_B.
- [ ] In Supabase SQL editor, run as USER_B's session is impossible
      from client; instead verify via service role (Supabase UI):
      `select count(*) from public.expense_entries where user_id = '<USER_A_id>';`
      still returns USER_A's row count.
- [ ] USER_B sees NONE of USER_A's data on screen.

PASS criteria — RLS enforces user isolation. USER_B cannot read
USER_A's rows even though they share the same anon key.

---

## Sign-off

Phase 152 is accepted iff every checkbox above passes on the same
deploy. Any failure → file a bug referencing this doc + the failing
step. No more feature work until accepted.

Tester:  ___________________________
Date:    ___________________________
Deploy:  ___________________________
Result:  ___ PASS  ___ FAIL
