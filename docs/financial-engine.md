# Financial Engine — Audit + Single Source of Truth Map

_Phase 390. This document is the canonical reference for every
financial calculation in the app. Any new feature MUST consume one
of the helpers listed here. No screen may calculate totals locally._

---

## TL;DR — Where the four containers get their numbers

| Container | Source helper | Returns |
|---|---|---|
| **Expenses commitments cockpit** (`expenses-commitments-cockpit.tsx`) | `getMonthlyObligationBreakdown` | `{ total, creditCardsTotal, bankFixedTotal, loansTotal, cashTotal, ... }` |
| **Where the money goes** (same cockpit bottom-sheet body) | same `getMonthlyObligationBreakdown.explanationRows` | per-lane rows |
| **Credit cards monthly container** (`CardsHierarchyCard`) — header `"סה״כ"` | `getCreditCardExposure(currentMonthKey).totalExpectedCharge` | one number |
| **Time screen forecast** (`useTimeEngine` → `liquidityCurve`) | `liquidityCurve.points[cursorIdx].balance` | running bank balance after every signed event |

Lock the invariants:
- `breakdown.creditCardsTotal === exposure.totalExpectedCharge` (Phase 377)
- `cardsHierarchyHeader === exposure.totalExpectedCharge` (Phase 380)
- `Σ buckets.source === "card" monthlyTotal (35-day window) === exposure.totalExpectedCharge − exposure.pendingTransactions` (Phase 388 + Phase 389 parity test)

The cockpit ⇄ credit-cards section ⇄ exposure helper all read the
same source. The Time forecast walks the same `buildCashFlowBuckets`
output via `liquidityCurve`, with one **deliberate** exclusion:
pending entries (`needsConfirmation || bankPending`) are NOT
deducted from the forecast because the bank hasn't seen them yet.
Anywhere else the cockpit shows them as a separate
`pendingTransactions` cell so the user can see what's unresolved.

---

## Helper graph

```
                  ┌──────────────────────┐
                  │  effective-cash-date │
                  │  • per-entry stream  │
                  │  • per-rule routing  │
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┴───────────────────────┐
       ▼                                             ▼
┌────────────────────┐                  ┌─────────────────────┐
│ buildCashFlowBuckets│                  │ getCreditCardExposure│
│  • rules + entries │                  │  • current month only│
│  • per-card buckets│                  │  • 6 sub-buckets     │
│  • per-loan buckets│                  │  • dedup via seen-set│
│  • bank_debit     │                  └──────────┬──────────┘
└──────────┬─────────┘                             │
           │                              ┌────────┴───────────┐
           ▼                              ▼                    ▼
┌──────────────────┐         ┌─────────────────────────┐   ┌───────────┐
│  liquidityCurve  │         │getMonthlyObligationBreakdown│ │ Cards   │
│  + income events │         │  • CREDIT lane delegated │   │ section  │
│  • day-by-day    │         │    to exposure           │   │ header   │
│    balance walk  │         │  • BANK / LOANS / CASH   │   │ total    │
└──────────┬───────┘         │    from explicit rule    │   └───────────┘
           │                  │    classification + loan │
           ▼                  │    schedule + withdrawals│
┌──────────────────┐         └─────────────┬────────────┘
│ buildFinancial   │                       │
│ Snapshot         │                       ▼
│ • EOM projection│         ┌─────────────────────────────┐
│                  │         │ Expenses commitments cockpit│
└──────────┬───────┘         │ "Where the money goes" body │
           │                  └─────────────────────────────┘
           ▼
┌──────────────────┐
│ buildDailyBudget │
│ View             │
│  • realAvailable │
│  • deficit       │
└──────────────────┘
```

---

## Per-container detail

### 1. Expenses commitments cockpit
- **File:** `src/components/expenses/expenses-commitments-cockpit.tsx`
- **Engine call:** `getMonthlyObligationBreakdown({ rules, loans, entries, statuses, monthKey: currentMonthKey() })`
- **Date range:** strict calendar month for the user's current local month (`monthKey` is `YYYY-MM`).
- **Lanes (every shekel counted exactly once via the internal seen
  set):**
  - `creditCardsTotal` = delegated to `getCreditCardExposure` so it
    always equals the credit-cards container header (Phase 377).
  - `bankFixedTotal` = active rules `paymentSource ∈ {bank, unknown}`
    AND not card-settled, scheduled this month.
  - `loansTotal` = active loans whose `loanSchedule(loan,
    monthKey).active`.
  - `cashTotal` = active rules `paymentSource === "cash"` +
    withdrawal entries dated this month (`transactionType ===
    "withdrawal"`).
- **Withdrawals:** always cash, never credit (regardless of
  `paymentMethod`).
- **Refunds:** excluded.
- **FX entries:** excluded (currency !== "ILS").
- **excludeFromBudget:** excluded.

### 2. "Where the money goes" body
Lives inside the same cockpit's bottom-sheet detail. Reads
`breakdown.explanationRows` 1:1. No extra math, no separate
classification. Identical to the cockpit by construction.

### 3. Credit-cards monthly container — `CardsHierarchyCard`
- **File:** `src/components/dashboard/cards-hierarchy-card.tsx`
- **Header `"סה״כ"`:** `getCreditCardExposure(currentMonthKey).totalExpectedCharge`
  (Phase 380).
- **Per-card per-month folder display:** `buildCardCategoryBreakdown`
  + `buildCardMonthFolders` — informational only; the headline is
  always the canonical exposure number.

### 4. Time screen forecast
- **Engine call:** `useTimeEngine(offset)` → `liquidityCurve({…})`.
- **Curve walk:** day-by-day balance, applying every event in
  `points[i].events`.
- **Card events:** sourced from `buildCashFlowBuckets`. Each card
  bucket's `obligations[]` (rules + entry slices) emit an event with
  `kind: "card"` on its `effectiveCashDate`.
- **Phase 388:** card impacts with no resolved `viaCardId` now land
  in a synthetic `card:__unassigned__` bucket instead of being
  dropped or misrouted to `bank_debit`.
- **Pending entries excluded by design:** `needsConfirmation` and
  `bankPending` are dropped from the stream because the bank hasn't
  seen them yet. Cockpit still shows them as a separate cell.

---

## Why the four containers can still differ — and which differences are intentional

| Delta | Cause | Is it a bug? |
|---|---|---|
| Cockpit credit > Time forecast credit | **Pending entries.** Cockpit counts `pendingTransactions`; the curve excludes them. | **No.** Intentional. The cockpit's bottom-sheet labels them "ממתינים לאישור" so the user knows. |
| Time forecast credit > Cockpit credit | None known after Phase 388. | **Bug.** Would fail the engine-parity test. |
| Cockpit credit ≠ Cards section credit | None known after Phase 380. Same canonical source. | **Bug.** Would fail Phase 377 + Phase 380 wiring. |
| Time forecast balance lower than expected | Card events for current-month spending settle on the **card's payment day**, often next month. A forecast cursor before that day legitimately excludes them. Forecast at "+27 days" (next billing day) reflects the deduction. | **No.** Cash-flow math, not a synchronisation bug. |
| Manual entry not visible on Time forecast at cursor "+1 day" | Entry settles on card payment day. Cursor "+1 day" → bank hasn't paid the card yet → not deducted. | **No.** Forecast deduction follows cash, not purchase. |
| Manual entry not visible on Time forecast at cursor "End of month" or "+2 next month" | Forecast at next billing day MUST reflect the entry. | **Bug.** This is what Phase 388 fixes (entries with no resolvable card no longer drop). Regression test added in Phase 390. |

---

## Helper inventory

| Helper | Inputs | Returns | Notes |
|---|---|---|---|
| `getCreditCardExposure` (`src/lib/credit-card-exposure.ts`) | rules, entries, statuses, monthKey | 6 sub-totals + grand total + per-row breakdown + duplicates-prevented | Phase 371. Canonical credit answer. |
| `getMonthlyObligationBreakdown` (`src/lib/monthly-obligation-breakdown.ts`) | rules, loans, entries, statuses, monthKey | 4 lane totals + explanationRows + duplicates-prevented | Phase 370 + 377. Credit lane delegated to exposure. |
| `buildCashFlowBuckets` (`src/lib/cash-flow-bucket.ts`) | accounts, loans, rules, statuses, entries, now, windowDays | per-card / per-loan / bank_debit buckets with obligations | Phase 388 routes all card impacts to a card bucket. |
| `liquidityCurve` (`src/lib/liquidity-curve.ts`) | accounts, loans, incomes, rules, statuses, entries, now, windowDays | day-by-day balance points with per-day signed events | Drives Time screen. |
| `buildFinancialSnapshot` (`src/lib/financial-snapshot.ts`) | accounts, loans, incomes, entries, rules, statuses, monthlyBudget, monthKey, now | EOM projection + actual spent + commitment categories | Used by CFO summary surfaces. |
| `buildDailyBudgetView` (`src/lib/daily-budget-view.ts`) | accounts, loans, incomes, entries, rules, statuses, now | Daily budget anchored on 10th-of-next-month with deficit handling | Phase 381 single SoT for the daily budget. |
| `effectiveCashImpactStream` / `effectiveCashImpactForRule` (`src/lib/effective-cash-date.ts`) | entries / rule, accounts, monthKey | per-entry / per-rule kind + amount + effective cash date | Routing primitive. Everything cash-date-aware ultimately calls these. |

---

## Hard rules for any future feature

1. Never sum entries / rules / loans in a UI component. Call a helper.
2. Never introduce a new lane classification. Extend the canonical
   helper instead.
3. Never duplicate the "what counts as credit" filter. Reuse
   `isRuleCardSettled` + `classifyEntry` (inside
   `credit-card-exposure.ts`).
4. Any future surface that needs a "credit total" MUST call
   `getCreditCardExposure`. The engine-parity test will fail
   otherwise.
5. Pending entries (`needsConfirmation || bankPending`) belong in
   the `pendingTransactions` bucket. Forecast surfaces deliberately
   exclude them; cockpit surfaces deliberately include them. Do not
   "fix" either side.

---

## Tests guarding the invariants

| Test file | Pins |
|---|---|
| `tests/engine-parity.test.ts` | exposure = breakdown = curve − pending; no credit leak to bank/loan/cash; withdrawal isolation |
| `tests/credit-curve-vs-cockpit.test.ts` | Phase 388 — credit impacts never dropped/misrouted |
| `tests/credit-single-source-of-truth.test.ts` | Phase 377 — breakdown credit lane = exposure verbatim |
| `tests/credit-card-exposure.test.ts` | exposure sub-bucket classification |
| `tests/monthly-obligation-breakdown.test.ts` | cockpit lane classification + dedup |
| `tests/snapshot-credit-routed-rules.test.ts` | snapshot keeps card-settled rules in credit lane |
| `tests/snapshot-card-rule-past-day.test.ts` | Phase 371 — card rule with dayOfMonth<today still counted |
| `tests/end-of-month-credit-vs-bank.test.ts` | EOM split between credit + bank |
| `tests/forecast-eom.test.ts` | forecast aligned with breakdown |
| `tests/daily-budget-view.test.ts` | daily-budget canonical contract |
| `tests/forecast-includes-manual-entries.test.ts` _(Phase 390)_ | manual credit entry deducted at the right cursor offset on the curve |

---

## Dev-only audit panel

`src/components/dev/financial-debug-panel.tsx` mounts only when
`NODE_ENV !== "production"` and shows every canonical number
side-by-side: cockpit lane totals, exposure sub-buckets, snapshot
EOM projections, daily-budget view. Phase 390 adds a delta detector
that flags `Cockpit Credit` vs `Curve Card (35d)` divergence beyond
`pendingTransactions`. If a future regression reintroduces a
mismatch, the panel turns red and surfaces the delta before the
user notices.
