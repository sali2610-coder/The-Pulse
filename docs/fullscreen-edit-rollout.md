# Full-Screen Edit Rollout

Phase 409 extracted the visual DNA of `expense-edit-fullscreen.tsx` into
reusable primitives so every Add / Edit surface across the system can
adopt the same premium feel without copy-pasting the layout.

## Shared shell

`src/components/ui/full-screen-edit-shell.tsx`:

- `FullScreenEditShell` — wraps `BottomSheet fullScreen lockDismiss noHandle`.
- `FullScreenHero` — large category icon + hero amount input.
- `FullScreenBody` — scroll container that keeps the sticky footer pinned.
- `FullScreenFieldList` + `FieldRow` — divided panel of label/value rows.
- `FullScreenChipRow` — gold-pill chips for account / source / card pickers.
- `FullScreenStepper` — `−` / `value` / `+` numeric control.
- `FullScreenSegmented<T>` — animated segmented control (gold pill).
- `FullScreenFooter` — sticky CTA + optional destructive secondary; iOS safe-area baked in.

All RTL by default. `dir="ltr"` only on tabular amount inputs.

## Pilot — shipped in Phase 409

| # | Screen | Status | Component |
|---|---|---|---|
| 1 | Add loan | ✅ shipped | `src/components/loans/loan-fullscreen-edit.tsx` |
| 2 | Edit loan | ✅ shipped | same |

Wired at `loan-summary-card.tsx`: tapping a row opens edit; new `+ הוסף הלוואה`
CTA opens add. Legacy `LoanDetailSheet` left mounted for the deprecated
entry-point and will be removed once no callers reference it.

## Remaining screens — rollout queue

Each screen lives next to its current implementation. Migration steps per row:
1. Read the existing form / sheet to extract store API and field set.
2. Create `<screen>-fullscreen-edit.tsx` next to the legacy file.
3. Replace the modal/sheet at every call site with `<…FullScreenEdit>`.
4. Delete the legacy form once no callers remain.

### Settings — financial config

| # | Add | Edit | Store API | Suggested filename |
|---|---|---|---|---|
| 3 | Recurring rule | Recurring rule | `addRule` / `updateRule` / `deleteRule` | `src/components/recurring/rule-fullscreen-edit.tsx` |
| 4 | Income | Income | `addIncome` / `updateIncome` / `deleteIncome` | `src/components/settings/income-fullscreen-edit.tsx` |
| 5 | Subscription | Subscription | RecurringRule subset (variant of #3) | reuse #3 |
| 6 | Credit-card obligation | Credit-card obligation | RecurringRule with `paymentSource="card"` | reuse #3 with `lockedPaymentSource="card"` |
| 7 | Bank account | Bank account | `addAccount` / `updateAccount` / `setAnchor` | `src/components/accounts/account-fullscreen-edit.tsx` |
| 8 | Credit card | Credit card | same as #7 with `kind="card"` | reuse #7 with `kind` lock |

### Day-to-day actions

| # | Add | Edit | Store API | Suggested filename |
|---|---|---|---|---|
| 9 | Expense | Expense | `addExpense` / `updateExpense` / `deleteExpense` | EXISTS — `expense-edit-fullscreen.tsx` (already premium) + `expense-dialog.tsx` (NEEDS migration to fullscreen shell) |
| 10 | Manual withdrawal | Manual withdrawal | `addExpense({ transactionType: "withdrawal" })` | `src/components/expense-form/withdrawal-fullscreen-edit.tsx` |
| 11 | Income event (one-shot) | Income event | future store action | `src/components/expense-form/income-event-fullscreen-edit.tsx` |
| 12 | Credit transaction | Credit transaction | `addExpense({ paymentMethod: "credit" })` — variant of #9 | reuse #9 with `lockedPaymentMethod="credit"` |
| 13 | Wallet transaction | Wallet transaction | `addExpense({ source: "wallet", needsConfirmation: true })` | new variant of #9 |

### Constraints (carry forward from Phase 409)

- Engine math is OFF LIMITS. The shell is presentation only.
- Tone tokens stay per-screen but draw from a small palette:
  - Loans: `#A78BFA` (purple).
  - Bank/withdrawals: `#34D399` (emerald).
  - Credit: `#75F5FF` (neon).
  - Income: `#FACC15` (gold).
  - Recurring rules: `#D4AF37` (rich gold).
  - Per-expense category icons keep their own accent (categories.ts).
- RTL preserved on every input row.
- `dir="ltr"` only on hero amount + tabular numbers.
- `paddingBottom: max(env(safe-area-inset-bottom), 0.5rem)` on every footer.
- Animations: `motion.span` for hero icon spring + segmented `layoutId` pill.
  No new motion variants — reuse what the shell exposes.

### Done-ness checklist per migration

For each row in the table above:

- [ ] New `*-fullscreen-edit.tsx` component drafted using the shell.
- [ ] All store actions (`add*`, `update*`, `delete*`) wired identically to the
      legacy form.
- [ ] Legacy entry-point (drawer / inline panel / button) replaced.
- [ ] Old form file deleted (or marked `// TODO Phase 41x — drop`).
- [ ] Manual smoke test: open in add mode, save → row appears. Open in edit mode,
      modify → row updates. Delete → row gone.
- [ ] `npm run typecheck`, `npm run lint -- --quiet`, `npm test`
      green; no engine regression.

When all 13 numbered screens are migrated, drop `src/components/ui/bottom-sheet.tsx`
from non-fullscreen callers if any remain.
