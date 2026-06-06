# Settings Mini-App Rollout

Phase 410 redefines every Settings folder as a mini-app: hero KPIs,
premium item cards, status pills, progress bars, gold "+ הוסף" CTAs,
full-screen edit. No more admin lists.

## Shared shell

`src/components/ui/mini-app-shell.tsx`:

- `MiniAppHero({ title, subtitle, kpis })` — 1-3 KPI tiles with tone
  glow, primary KPI gets `emphasis` for a slightly larger value.
- `MiniAppAddCta({ label, onClick })` — gold "+ הוסף" CTA. Always
  appears at the top of the list (above section labels).
- `MiniAppStatusPill({ tone, children })` — tone-coloured badge for
  "פעיל" / "מסתיים בקרוב" / etc.
- `MiniAppListCard({ icon, tone, title, subtitle, primaryValue, primaryCaption, progress, progressLabel, status, onClick })` —
  premium row. Icon left, primary amount right, optional progress
  bar at the bottom, optional status pill under the title.
- `MiniAppEmpty({ icon, title, body, cta })` — empty state with a
  "+ הוסף" CTA so first-time users have a clear next step.
- `MiniAppSectionLabel({ children })` — small uppercase divider
  inside larger mini-apps ("פעילות עכשיו", "מתחילות בקרוב").

All primitives RTL by default. `dir="ltr"` only on amount values.

## Pilot — shipped in Phase 410

| # | Folder | Component | Status |
|---|---|---|---|
| 1 | הלוואות (Loans) | `src/components/loans/loans-mini-app.tsx` | ✅ shipped |

Hero: monthly outflow + total remaining + debt-free month. Section
labels split active vs starting-soon. Each loan card shows progress
(paymentNumber/totalPayments), status pill, day-of-month + end-month
subtitle. Tap opens `LoanFullScreenEdit` (Phase 409 shell). "+ הוסף
הלוואה" CTA opens add mode. Empty state guides first-time users.

Wired at `settings-tab.tsx` — replaces `<LoansPanel />` inside the
loans accordion. Legacy panel stays in the codebase for the
dashboard until that caller migrates.

## Remaining folders — rollout queue

For each row: build the mini-app component using the shell, replace
the inner panel inside `settings-tab.tsx`, leave the legacy panel
file until every other caller (e.g. dashboard widgets) migrates.

| # | Folder | Engine surface (KPIs) | Suggested filename |
|---|---|---|---|
| 2 | חשבונות בנק וכרטיסים | totalAnchors / # cards / next billing day | `src/components/accounts/accounts-mini-app.tsx` |
| 3 | הוצאות קבועות ומנויים | `getRecurringCommitmentsByCategory.total` / # active rules / housing share | `src/components/recurring/recurring-mini-app.tsx` |
| 4 | הכנסות | `getMonthlyIncome.total` / # sources / next payday | `src/components/income/income-mini-app.tsx` |
| 5 | בקרת תקציב אוטומטית | engine `buildDailyBudgetView` — daily allowance + deficit + simulated outcome | `src/components/settings/budget-mini-app.tsx` |
| 6 | הצעות חכמות | recurring-suggestions count + rule-drift count + savings opportunity | `src/components/insights/suggestions-mini-app.tsx` |
| 7 | בדיקות ומנויים | dormant rules count + subscription suggestions count | `src/components/insights/checks-mini-app.tsx` |
| 8 | פעילות החודש | RecentActivity tile already premium; needs only hero strip + filter chips | `src/components/dashboard/activity-mini-app.tsx` (wrap existing RecentActivity) |

### Tone palette (per folder)

| Folder | Tone |
|---|---|
| Loans | `#A78BFA` purple |
| Accounts (bank) | `#34D399` emerald |
| Cards | `#75F5FF` neon |
| Recurring | `#D4AF37` rich gold |
| Income | `#FACC15` gold |
| Budget | `#F87171` red |
| Suggestions | `#22D3EE` cyan |
| Checks | `#A78BFA` purple |
| Activity | `#75F5FF` neon |

### Migration recipe per folder

1. Read existing panel to extract engine helpers + actions.
2. Decide hero KPIs (≤3, primary gets emphasis).
3. Decide list-card columns: title, subtitle, primary, optional progress, optional status pill.
4. Build the mini-app component using `MiniAppHero`, `MiniAppAddCta`, `MiniAppListCard`, `MiniAppEmpty`, `MiniAppSectionLabel`.
5. Wire `FullScreenEditShell`-based add/edit (Phase 409 for those; new fullscreens to follow per `docs/fullscreen-edit-rollout.md`).
6. Replace `<LegacyPanel />` inside `settings-tab.tsx` with the mini-app.
7. Run `npm run typecheck`, `npm run lint -- --quiet`, `npm test`.
8. Smoke test: hero numbers match the existing dashboard, list cards open the right fullscreen, empty state renders for fresh state.

### Constraints (carry forward)

- Engine math is OFF LIMITS. Mini-apps READ engine output. No new totals.
- Every "+ הוסף" / row tap → opens a `FullScreenEditShell` (Phase 409).
- No new accordion / nested drawer. Mini-app body lives directly inside `SettingsAccordion`.
- RTL on every text row. `dir="ltr"` only on tabular amounts.
- Status pill toning matches the row tone unless the row is in an alert state.
- Empty state ALWAYS has a CTA — never a dead-end message.
- Mobile: 1-2 column hero grid; section labels keep list scannable.

### Done-ness checklist per folder

- [ ] Engine data wired (no new local sums).
- [ ] Hero KPIs reproduce numbers visible elsewhere in the product.
- [ ] List card per item — icon, tone, primary, subtitle, optional progress + status.
- [ ] Tap → opens a `FullScreenEditShell`-based fullscreen for that item.
- [ ] "+ הוסף" CTA opens the same fullscreen in add mode.
- [ ] Empty state present and guides the user to add the first row.
- [ ] Inside the SettingsAccordion: no new chrome, height collapses cleanly.
- [ ] typecheck / lint / tests green.

When all 8 folders ship, `LoansPanel` / `AccountsPanel` / `IncomePanel`
/ `RecurringRulesPanel` / `BudgetInput` / suggestion cards can be
deleted from the repo.
