# Settings Redesign — Phases 411–418

End-to-end redesign of the Settings tab from accordion-of-forms to
mini-app-per-folder. Every section now has hero KPIs, premium item
cards, a gold "+ הוסף" CTA, an empty state with a CTA, and a
FullScreenEditShell-based add/edit flow where applicable.

## Phase-by-phase

| Phase | Folder | Outcome |
|---|---|---|
| 409 | Loans (foundation) | FullScreenEditShell primitives + LoanFullScreenEdit |
| 410 | Loans (mini-app) | LoansMiniApp shipped first |
| 411 | Notifications + Shortcut | Status hero, diagnostics collapse |
| 412 | Accounts (Bank + Cards) | Split into two visual sections inside one mini-app, anchor freshness pill, AccountFullScreenEdit |
| 413 | Recurring expenses & subscriptions | Flat list w/ filter chips, source badge, countdown, installment progress, RuleFullScreenEdit |
| 414 | Income | Variance KPI, payday countdown, "✓ סמן כהתקבל" inline action, IncomeFullScreenEdit |
| 415 | Budget Control | Live dashboard w/ sliders + simulated cap + EOM status hero |
| 416 | תובנות לאישור | Merged הצעות חכמות + בדיקות ומנויים, chip filter |
| 417 | פעילות החודש | Removed from Settings (duplicated Home) |
| 418 | Polish | Suite green, summary doc |

## Shell primitives shipped

`src/components/ui/full-screen-edit-shell.tsx`
- FullScreenEditShell · FullScreenHero · FullScreenBody
- FullScreenFieldList · FieldRow · FullScreenChipRow
- FullScreenStepper · FullScreenSegmented · FullScreenFooter

`src/components/ui/mini-app-shell.tsx`
- MiniAppHero · MiniAppAddCta · MiniAppStatusPill
- MiniAppListCard · MiniAppEmpty · MiniAppSectionLabel
- MiniAppStatusHero · MiniAppToggleRow · MiniAppDisclosure

## Tone palette per folder

| Folder | Tone |
|---|---|
| Loans | `#A78BFA` purple |
| Accounts (bank) | `#34D399` emerald |
| Accounts (cards) | `#75F5FF` neon |
| Recurring | per-category color via getCategory(rule.category) |
| Income | `#FACC15` gold |
| Budget Control | `#F87171` red |
| Insights inbox | `#22D3EE` cyan |
| Notifications | `#34D399` (granted) / `#F87171` (denied) |
| Shortcut | `#22D3EE` cyan |

## Engine contract preserved

No engine math changed across 411–418. Every mini-app reads
canonical engine surfaces:
- AccountsMiniApp → `engine.getCreditExposure` for card KPI.
- RecurringMiniApp → `ruleSchedule`, `isRuleCardSettled`, `getCategory`.
- IncomeMiniApp → `engine.getMonthlyIncome`, `incomeForMonth`.
- BudgetMiniApp → `buildDailyBudgetView`.
- LoansMiniApp → `summarizeLoans`, `buildObligationsOverview`.

## Suite

typecheck ✓ · lint ✓ · 26/26 reconciliation ✓ · 1348 pass / 101
pre-existing unrelated failures / zero new regressions across all
seven phases.

## What still uses legacy components

- `LoansPanel` — referenced by the dashboard's LoanSummaryCard.
- `AccountsPanel` — referenced by other dashboard widgets that
  surface account chips.
- `IncomePanel` — referenced by the dashboard if the user lands on
  the income-explain sheet from Home.
- `RecurringRulesPanel` — still mounted by the Insights tab
  (`commitments` folder in `insights-tab.tsx`).
- `BudgetInput` — still on disk (no other consumers; safe to delete).
- `recent-activity.tsx` — still on Home; only removed from Settings.

These will retire once their non-Settings callers migrate to the
mini-app variants or to direct engine reads.
