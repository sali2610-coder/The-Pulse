# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sally — Smart Expense Tracker.** מערכת תיעוד הוצאות אישית בסגנון "Luxury Fintech": ממשק web יוקרתי ב־Dark Mode RTL שמאפשר תיעוד הוצאה תוך פחות מ־3 שניות, ניהול תקציב חודשי עם תשלומים פרוסים והוצאות קבועות, ושידוך אוטומטי בין חיובים נכנסים להוצאות צפויות. בשלב זה אין backend אמיתי — כל המצב נשמר ב־localStorage דרך Zustand ([src/lib/store.ts](src/lib/store.ts)), ובמקביל כל הוצאה נשלחת גם ב־POST ל־endpoint חיצוני ([src/lib/api.ts](src/lib/api.ts)) להמשך עיבוד עתידי.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript.
- **Styling:** Tailwind CSS v4 (CSS-first config ב־[src/app/globals.css](src/app/globals.css), לא tailwind.config.ts).
- **רכיבי UI:** shadcn/ui (style: `base-nova`, RTL מופעל) — primitives ב־[src/components/ui/](src/components/ui).
- **אנימציות:** Framer Motion. אנימציית הצלחה — SVG משורטט עם Framer ([success-overlay.tsx](src/components/expense-form/success-overlay.tsx)). `lottie-react` מותקן לעתיד.
- **טפסים:** `react-hook-form` + `zod` (`@hookform/resolvers`). הסכמה ב־[src/lib/schema.ts](src/lib/schema.ts).
- **Mutations / cache:** `@tanstack/react-query` ([src/app/providers.tsx](src/app/providers.tsx)).
- **State (persisted):** `zustand` עם middleware `persist` (localStorage) ב־[src/lib/store.ts](src/lib/store.ts).
- **Toasts:** `sonner` (Toaster ב־providers, RTL).
- **פונטים:** Geist Sans + Heebo (Hebrew fallback) + Geist Mono. Tabular numerals גלובלי על `[data-mono="true"]`, `[data-financial]`, `<output>`, `.font-mono`. הוגדר ב־[layout.tsx](src/app/layout.tsx) ו־[globals.css](src/app/globals.css).
- **צבעי מותג:** Charcoal `#0A0A0A`, Surface `#1A1A1A`, Neon `#00E5FF`, Gold `#D4AF37` — מוגדרים תחת `.dark` ב־[globals.css](src/app/globals.css).

## Architecture

### Data model ([src/types/finance.ts](src/types/finance.ts))

- **`Account`** — ישות multi-account (`kind: "bank" | "card"`). חשבונות בנק נושאים `anchorBalance` (יתרה חיה שהמשתמש מזין ידנית) + `anchorUpdatedAt`. כרטיסים נושאים `issuer` + `cardLast4`. ב־`addExpense` חיוב SMS מקבל `accountId` אוטומטי דרך `resolveAccountId()` (חיפוש כרטיס פעיל לפי `issuer`+`cardLast4`).
- **`Loan`** — הלוואה: `monthlyInstallment`, `remainingBalance`, `endDate`, `dayOfMonth`. נכנסת אוטומטית ל־CFO forecast.
- **`Income`** — הכנסה צפויה: `amount`, `dayOfMonth`. נספרת ב־CFO forecast רק אם dayOfMonth >= היום.
- **`ExpenseEntry`** — רשומת הוצאה (manual/auto), עם `amount`, `installments`, `paymentMethod` (`cash`/`credit`), ו־`chargeDate`. תשלום חודשי = `amount/installments`, מתחיל מ־chargeDate. Auto-ingested entries כוללים גם `externalId` (deduplication key), `issuer` (`"cal"|"max"`), `cardLast4`, `merchant`, ו־`accountId` כשניתן לפתור.
- **`RecurringRule`** — הוצאה צפויה חוזרת (חשמל, ועד בית...) עם `dayOfMonth`, `estimatedAmount`, ו־`keywords` לשידוך.
- **`RecurringStatus`** — מצב per-rule per-month: `pending` או `paid`. סטטוס "paid" מצביע על `matchedExpenseId` ועל `actualAmount` בפועל.

### Store ([src/lib/store.ts](src/lib/store.ts))

Zustand יחיד עם persistence ב־localStorage תחת `sally.finance` (`version: 2`). flag `hasHydrated` מאפשר לקומפוננטות לדעת שה־state נטען (חשוב כדי למנוע hydration mismatch ב־SSR — כל הקומפוננטות מבוססות־store מציגות 0/ריק עד הידרציה). שדות:

- `entries`, `rules`, `statuses`, `monthlyBudget` (ברירת מחדל 0).

פעולות עיקריות:

- `addExpense(input)` — מוסיף רשומה, ומריץ matching: אם נמצא `RecurringRule` תואם, מעדכן אוטומטית `RecurringStatus` לחודש הרלוונטי כ־`paid` ומקשר את שני הצדדים.
- `deleteExpense(id)` — מסיר הוצאה ומחזיר rule ששודך אליה ל־pending.
- `addRule / updateRule / deleteRule / toggleRule` — CRUD על הוצאות קבועות. מחיקה מנקה גם statuses וקישורים מ־entries.
- `setMonthlyBudget(value)` — קובע יעד חודשי גלובלי.
- `addAccount / updateAccount / setAnchor / toggleAccount / deleteAccount` — multi-account CRUD. `setAnchor` הוא הקיצור הנפוץ ל"עדכן יתרה חיה".
- `addLoan / updateLoan / toggleLoan / deleteLoan` — Loans CRUD.
- `addIncome / updateIncome / toggleIncome / deleteIncome` — Incomes CRUD.
- `setAudioEnabled(v)` — toggle של chime על sync.
- **Migrations**: v1→v2 (paymentMethod), v2→v3 (lastSyncedAt), v3→v5 (accounts/loans/incomes/audioEnabled). v4 דולג.

### Matching ([src/lib/match.ts](src/lib/match.ts))

ל־entry חדש: מסנן rules באותה קטגוריה שעדיין `pending` בחודש של `chargeDate`. מחזיר את הראשון שעובר אחד משני הקריטריונים — סכום בטווח ±25% מהאומדן, או מילת מפתח (`keywords[]` או `label`) שמופיעה ב־`note`/`label`.

### Projections ([src/lib/projections.ts](src/lib/projections.ts))

חישובי הדאשבורד נעשים בקליינט מהמצב המקומי:

- `sliceForMonth(entry, monthKey)` — מחזיר את פרוסת התשלום שתחויב באותו חודש (אם קיימת), כולל תאריך החיוב הצפוי בחודש זה.
- `projectMonth({ entries, rules, statuses, monthKey })` — מחשב `actual` (פרוסות שכבר חויבו עד `now`), `upcoming` (פרוסות עתידיות באותו חודש + סכום אומדן של rules שעדיין pending) ו־`projected = actual + upcoming`.
- `actualUntilDay({ entries, monthKey, day })` — סכום הפרוסות עד יום מסוים בחודש; משמש ל־benchmark של "חודש קודם באותו יום".
- `actualByPaymentMethod(...)` ו־`categoryTotals(...)` — פיצולים עבור הטאב Analytics.
- `daysInMonth(monthKey)` — מספר הימים בחודש, לחישובי קצב.
- `pendingRulesForMonth(...)` — רשימה ממוינת לפי `dayOfMonth` של rules פעילים לחודש מסוים, יחד עם הסטטוס הנוכחי.

### Tabs / UI shell

[src/app/page.tsx](src/app/page.tsx) הוא ה־shell: מחשב `isOverBudget` ומציב `data-danger="true"` על `<main>` — CSS ב־[globals.css](src/app/globals.css) מוסיף `danger-breath` (ambient red glow) ועושה override ל־accents. בתוך ה־shell יש `Tabs` של shadcn (`base-ui`):

- **Dashboard** ([dashboard-tab.tsx](src/components/dashboard/dashboard-tab.tsx)) — `PulseBar`, `TimelineSync`, `StatsCards`, כפתור הוספה, `UpcomingExpenses`.
- **Analytics** ([analytics-tab.tsx](src/components/analytics/analytics-tab.tsx)) — `CashVsCredit`, `CategoryBreakdown`.
- **Settings** ([settings-tab.tsx](src/components/settings/settings-tab.tsx)) — `BudgetInput`, `RecurringRulesPanel` (CRUD inline, ללא dialog).

### Pulse + Timeline ([src/components/pulse/](src/components/pulse))

- **`PulseBar`** ([pulse-bar.tsx](src/components/pulse/pulse-bar.tsx)) — סרגל glassmorphism עם 3 שכבות:
  - **Current** (gradient solid) — הוצאות בפועל מתוך תקציב, מונפש ב־spring.
  - **Projected** (gradient שקוף) — הוצאות בפועל + עתידיות. תמיד מאחורי ה־current.
  - **Budget marker** (קו אנכי לבן) — מיקום ה־`monthlyBudget` על הסקלה.
  - **Benchmark marker** (קו דקודקוד) — `actualUntilDay` של החודש הקודם באותו יום.
  - סטטוס traffic-light לפי `actual / budget`: ירוק <70%, צהוב 70–90%, אדום ≥90%, חריגה (>100%) → מוסיף pulse אדום ו־`scale: [1, 1.4, 1]` על נקודת הסטטוס.
- **`TimelineSync`** ([timeline-sync.tsx](src/components/pulse/timeline-sync.tsx)) — שני tracks (`days elapsed %` מול `spend %`). חישוב `pace = spend% - days%`: אם +5%↑ → קצב גבוה (אדום), ±5% → מאוזן (צהוב), אחרת מתון (ירוק).

### ExpenseDialog ([src/components/expense-form/expense-dialog.tsx](src/components/expense-form/expense-dialog.tsx))

form עם `useForm` + `zodResolver`. שדות: AmountInput, CategoryGrid, [PaymentMethodToggle](src/components/expense-form/payment-method-toggle.tsx) (cash/credit עם `layoutId` pill), [InstallmentsInput](src/components/expense-form/installments-input.tsx) (stepper 1–60 עם תצוגה חיה של "חיוב חודשי"), Textarea להערה. `useMutation` קורא קודם ל־`addExpense` של ה־store (שמעורר matching), אחר כך מנסה `postExpense` ל־endpoint — אם זה נכשל, ה־toast מסביר שזה נשמר מקומית. אם בוצע שידוך → `toast.success("שודך אוטומטית: <label>")`.

### Guidelines

- כל UI שמשתמש ב־Framer / hooks הוא `"use client"`. ה־layout עצמו נשאר server component.
- ניהול open/close של Dialog נעשה ב־`handleOpenChange` (לא ב־`useEffect` על `open`) כדי לא להפעיל setState ב־effect — חוקיות שה־ESLint מחייב.
- קטגוריות מוגדרות ב־[src/lib/categories.ts](src/lib/categories.ts) ו־`CATEGORY_IDS` משמש כ־`z.enum(...)` — להוסיף קטגוריה חדשה דרך הקובץ הזה בלבד; ה־schema מתעדכן אוטומטית.
- **selectors מ־zustand**: לקרוא תמיד עם selector מצומצם (`useFinanceStore((s) => s.entries)`) ולא לקחת את כל ה־state, כדי לא לגרום ל־re-render מיותר.
- **עבודה עם monthKey**: פורמט `"YYYY-MM"` בלבד. כלי עזר ב־[src/lib/dates.ts](src/lib/dates.ts) (`monthKeyOf`, `monthIndex`, `addMonths`, `dayWithinMonth`).

## Commands

```sh
npm install              # להתקנה ראשונה
npm run dev              # שרת פיתוח (Turbopack) על http://localhost:3000
npm run build            # production build
npm run start            # להריץ build בצורת prod
npm run lint             # ESLint flat config (eslint.config.mjs)
npm run typecheck        # tsc --noEmit
npm test                 # Vitest run-once (unit tests ב־tests/)
npm run test:watch       # Vitest watch mode
npm run test:e2e:install # להוריד דפדפן Chromium ל־Playwright (חד-פעמי)
npm run test:e2e         # Playwright E2E (e2e/) — מפעיל אוטומטית את dev server
```

ריצת בדיקה בודדת: `npm test -- tests/projections.test.ts` או `npm test -- -t "matches by amount"`.

## Environment

ראה [.env.example](.env.example) לרשימה מלאה. עיקרי:

```
NEXT_PUBLIC_EXPENSE_ENDPOINT=https://your-endpoint.example.com/api/expenses
WEBHOOK_SECRET=<HMAC-SHA256 secret כדי להפעיל את /api/webhooks/transactions>
NEXT_PUBLIC_AUTH_ENABLED=false                 # שנה ל־true רק כשיש מפתחות Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
OPEN_BANKING_PROVIDER=plaid                    # plaid | il-open-banking | mock
```

שימושי ל־dev: [webhook.site](https://webhook.site) — מספק URL חינמי שמאפשר לראות payloads. ה־prefix `NEXT_PUBLIC_` נחוץ כי הקריאה ל־`postExpense` מתבצעת מה־client.

## Multi-user mode (Clerk + per-user data isolation)

Auth flag at [src/lib/auth-config.ts](src/lib/auth-config.ts) — true once `NEXT_PUBLIC_AUTH_ENABLED=true` + Clerk publishable + secret keys are set. When ON:

- [middleware.ts](src/middleware.ts) protects everything except `/api/webhooks/*`, the manifest, icons, the SW file, and `/sign-{in,up}`. Every other route (`/api/transactions/*`, `/api/push/*`, `/api/auth/*`, the dashboard itself) requires a Clerk session.
- [providers.tsx](src/app/providers.tsx) wraps the tree in `ClerkProvider`.
- [HeaderUser](src/components/auth/header-user.tsx) renders Clerk's `UserButton` (avatar + sign-out) at the dashboard top-right.

### Scope model

[src/lib/scope.ts](src/lib/scope.ts) + [src/lib/scope-resolver.ts](src/lib/scope-resolver.ts).

A **Scope** is either `{ kind: "user", id: <Clerk userId> }` (multi-user) or `{ kind: "device", id: <deviceId> }` (legacy single-user). All KV functions in [src/lib/kv.ts](src/lib/kv.ts) accept a `Scope` and embed it into key prefixes — `sally:user:<userId>:tx`, `sally:device:<deviceId>:tx`, etc. There is **no path** for one user to read another user's data: the routes call `resolveRequestScope(req)` which uses Clerk's `auth()` server helper, never trusting a client-supplied identifier.

### Personal API Tokens

[src/lib/api-token.ts](src/lib/api-token.ts) — each Clerk user owns one `stk_…` token (256-bit random, hex-encoded). KV layout:

- `sally:apitoken:<token>` → userId (reverse index, used by webhook to resolve)
- `sally:user:<userId>:apitoken` → token (forward, for display in Settings)

The iOS Shortcut sends `Authorization: Bearer stk_…` to the webhook; in multi-user mode the global `WEBHOOK_SECRET` is rejected. Rotating the token immediately invalidates the old one (DEL on the reverse-index key).

UI: [src/components/settings/api-token-card.tsx](src/components/settings/api-token-card.tsx) — generate / reveal / copy / rotate / revoke. CRUD endpoint at [src/app/api/auth/token/route.ts](src/app/api/auth/token/route.ts) (Clerk-required).

### MFA + dashboard config

MFA is configured in the Clerk dashboard (Sign-in factors → enable Authenticator app / SMS). Code doesn't enforce it; Clerk does on the sign-in flow.

## PWA

- [src/app/manifest.ts](src/app/manifest.ts) — מטא של אפליקציה (RTL, theme color charcoal, icons SVG).
- [public/icon.svg](public/icon.svg), [public/icon-maskable.svg](public/icon-maskable.svg) — אייקונים.
- [public/sw.js](public/sw.js) — Service Worker מינימלי: cache shell + network-first navigation, אגנוסטי ל־`/_next/*` ו־`/api/*`.
- [src/components/pwa/register-sw.tsx](src/components/pwa/register-sw.tsx) — רושם את ה־SW ב־production בלבד (לא ב־dev כדי לא להפריע ל־HMR).
- iOS "Add to Home Screen": `appleWebApp` ב־[layout.tsx](src/app/layout.tsx).

## SMS ingestion pipeline (CAL / MAX → Pulse)

זהו הצינור שמחבר חיובי ויזה אמיתיים לדאשבורד דרך iOS Shortcut + Vercel KV. ראה [docs/ios-shortcut.md](docs/ios-shortcut.md) למדריך משתמש.

```
SMS חיוב מהבנק
    ↓
iOS Shortcut (Automation: When I receive a message from CAL/MAX)
    ↓ POST { issuer, smsBody } with Bearer + x-sally-device
/api/webhooks/transactions  (Edge)
    ↓ parseSmsByIssuer → ZADD to Upstash
KV: sally:tx:<deviceId>  (sorted set by receivedAt)
    ↓ on PWA visibility / poll
/api/transactions/sync?since=<ms>  (Edge)
    ↓ ZRANGEBYSCORE
useAutoSync → addExpense({ source: "auto", externalId })  (de-dups)
    ↓
The Pulse animates with new charge
```

### Webhook ([src/app/api/webhooks/transactions/route.ts](src/app/api/webhooks/transactions/route.ts))

Edge runtime (`runtime = "edge"`). שכבות הגנה:

1. `WEBHOOK_SECRET` חייב להיות מוגדר, אחרת 503.
2. `Authorization: Bearer <WEBHOOK_SECRET>` (constant-time compare).
3. `x-sally-device` header עם deviceId שעובר whitelist regex.
4. Body cap: 16KB.
5. zod שורף על `{ issuer: "cal"|"max", smsBody: string }`.
6. `parseSmsByIssuer` → `pushTransaction` ([src/lib/kv.ts](src/lib/kv.ts)) עם ZADD NX (idempotent על externalId).

### Parsers ([src/lib/parsers/](src/lib/parsers))

- [helpers.ts](src/lib/parsers/helpers.ts) — regex משותפים: `extractAmount`, `extractCardLast4` (מטפל ב־ם/מ/מת/מה suffixes), `extractMerchant` (תומך 6 quote variants כולל gershayim/curly), `extractDateDDMMYY`, `detectsApplePay`, `externalIdFor` (SHA-256 דטרמיניסטי).
- [cal.ts](src/lib/parsers/cal.ts), [max.ts](src/lib/parsers/max.ts) — per-issuer parsers שמחזירים `{ ok: true, result } | { ok: false, reason, missing }`.
- [index.ts](src/lib/parsers/index.ts) — dispatcher + `categorize(merchant)` heuristic.
- כיסוי בדיקות ב־[tests/parsers.test.ts](tests/parsers.test.ts) — 9 בדיקות יחידה לדגימות אמיתיות.

### Sync ([src/app/api/transactions/sync/route.ts](src/app/api/transactions/sync/route.ts))

GET עם `x-sally-device` ו־`?since=<ms>`. מחזיר עד 200 transactions מהזמן `since`. clamp של 7 ימי lookback. Edge.

### AutoSync hook ([src/lib/sync.ts](src/lib/sync.ts))

`useAutoSync()` — fires on hydration, on `visibilitychange`, ועל interval של 60s כש־`document.visibilityState === "visible"`. מקבל transactions, קורא ל־`addExpense({ source: "auto", externalId })`. ה־store מבצע dedupe על externalId כדי שריפליי לא יחייב פעמיים.

### Vercel KV ([src/lib/kv.ts](src/lib/kv.ts))

`@upstash/redis` REST client (עובד ב־Edge runtime). Auto-provision ב־Marketplace integration → `KV_REST_API_URL` + `KV_REST_API_TOKEN`. שומר transactions בסוג ZSET תחת `sally:tx:<deviceId>` עם score=`receivedAt` ו־TTL 90 ימים.

`isKvConfigured()` מאפשר ל־endpoints להחזיר `{ persisted: false }` במקום לזרוק כשהאינטגרציה עוד לא מותקנת — שימושי ל־preview deployments.

## Open Banking provider abstraction

[src/lib/open-banking.ts](src/lib/open-banking.ts) — interface כללי `OpenBankingProvider` (id, normalize, getLinkUrl). כרגע רק `mockProvider` מימושי (משמש לתיעוד ולבדיקות). מימוש אמיתי יחיה ב־`src/lib/providers/<name>.ts` ויבחר ב־runtime לפי `OPEN_BANKING_PROVIDER`. ראה הערות בקובץ — Plaid דורש sandbox account, ובארץ אין SDK יחיד (אגרגטור per-bank לפי תקן Open Banking של בנק ישראל).

## API security ([src/lib/api.ts](src/lib/api.ts))

`postExpense` עוטף את ה־fetch עם:
- בדיקת `https:` (או `http://localhost` ב־dev).
- sanitization של ה־payload: clamp לקטגוריות/סכומים/אורך הערה, סינון C0 control chars + DEL.
- `AbortController` עם 8s timeout.
- `cache: "no-store"`, `credentials: "omit"`, `mode: "cors"` — לא שולח cookies או client cache.
- cap על body size (8KB).

## Notes for Claude

- העבודה מצומצמת לתיקייה הזו בלבד — אין לגעת בקבצים מחוצה לה (memory rule).
- **Tailwind v4 — אין `tailwind.config.ts`.** כל ה־theme tokens חיים ב־[src/app/globals.css](src/app/globals.css) תחת `@theme inline` ו־`.dark`. הוספת token חדש = הוספת CSS variable ב־`.dark` + מיפוי תחת `@theme inline`.
- **shadcn add** ל־`base-nova` style: יש components שלא קיימים תחת השם המקובל (למשל `form` לא נוצר בהוספה רגילה). בנינו את הטופס ישירות מעל `react-hook-form` ללא wrapper של shadcn.
- **RTL:** ה־`<html dir="rtl">` קבוע ב־[layout.tsx](src/app/layout.tsx). כשכותבים flex/grid להעדיף `start/end` במקום `left/right`. מספרים שצריכים להיראות LTR (סכומים, ₪) דורשים `dir="ltr"` מקומי.
- **React 19 + React Compiler:** ESLint כאן אוסר `setState` סינכרוני בתוך `useEffect`. אם מתעורר צורך — להעביר ל־event handler או לעטוף ב־`onOpenChange` של הרכיב.
- **localStorage hydration**: `useFinanceStore.persist` מציב `hasHydrated=true` רק אחרי טעינה. לפני זה, חישובים מבוססי־store חייבים להחזיר ערכי ברירת מחדל (0/ריק) כדי למנוע SSR mismatch.
- **Dev seed panel**: [src/components/dev/seed-panel.tsx](src/components/dev/seed-panel.tsx) מוצג רק כש־`NODE_ENV !== "production"`. מאפשר טעינת תרחישים מ־[mock-data.ts](src/lib/mock-data.ts) (מאוזן / חריגה / תשלומים ארוכים / מזומן בעיקר / מקרי קצה) או ניקוי הכל.

## CFO Brain — `forecastEndOfMonth` ([src/lib/forecast.ts](src/lib/forecast.ts))

הנוסחה:

```
forecast = totalAnchors + expectedIncome
        − pendingFixed − pendingLoans − futureCardSlices
```

- `totalAnchors` — Σ active bank `anchorBalance` (כולל שליליים).
- `expectedIncome` — Σ `incomes` שעוד לא הגיעו (`dayOfMonth >= today`).
- `pendingFixed` — Σ `RecurringRule.estimatedAmount` שעדיין pending החודש.
- `pendingLoans` — Σ `Loan.monthlyInstallment` שעוד לא חויבו (`dayOfMonth >= today`, פעיל וביתרה > 0).
- `futureCardSlices` — Σ slices של `entries` שיחויבו בהמשך החודש (slice.chargeDate > now). מתעלם מ־refunds ו־FX.

הצגת התוצאה ב־[CfoSummary](src/components/dashboard/cfo-summary.tsx): כרטיס bento ירוק/אדום עם 6 שורות פירוק. **אם אין anchors פעילים → CTA להגדיר.** בדיקות יחידה ב־[tests/forecast-eom.test.ts](tests/forecast-eom.test.ts) (7 specs).

## Predictive engine + History ([src/lib/forecast.ts](src/lib/forecast.ts))

- `forecastMonthEnd({ entries, rules, statuses, monthlyBudget, monthKey })` — מחזיר `Forecast` עם `projectedTotal`, `variance`, `breachDay`, `dailyBurn`, `historicalDailyBurn`, `paceVsHistorical` (lookback 3 חודשים), `confidence` (`low | medium | high`).
- `dailyAllowance(...)` — `{ allowance, spentToday, daysRemaining, committedRemaining }`. כמה ₪ אפשר להוציא היום בלי לחרוג: `(budget − actual − upcoming) / daysRemaining`. בשימוש ב־[DailyAllowance](src/components/dashboard/daily-allowance.tsx) כרטיס "מותר היום" שצובע אדום אם הוצאת היום גדולה מהמכסה.
- `categoryTrends(...)` — לכל קטגוריה: `thisMonth`, `priorAverage`, `delta`, `deltaPct`. בשימוש ב־[CategoryTrendsCard](src/components/history/category-trends.tsx).
- `monthOverMonthTotals(...)` — מערך מסודר של 6 חודשים. בשימוש ב־[MonthOverMonth](src/components/history/month-over-month.tsx).
- בדיקות ב־[tests/forecast.test.ts](tests/forecast.test.ts) — 11 unit tests.
- ב־[PulseBar](src/components/pulse/pulse-bar.tsx): המרקר הצהוב מציג את `projectedTotal` על הסקלה; הופך אדום אם `projectedTotal > budget`. כרטיס פרטים מתחת לסרגל מציג חריגה צפויה / מרווח, יום החצייה, קצב מול היסטוריה, רמת ביטחון.

## Hardening: dedup + edge cases + sanitization

- **Cross-source de-duplication** ([src/lib/dedup.ts](src/lib/dedup.ts)): `findFuzzyDuplicate(candidate, entries)` מתאים עסקה חדשה ל־entry קיים לפי **(תאריך ±2 ימים, סכום ±1₪ או ±1%, normalized merchant)**. מטפל במקרה ש־SMS וייבוא CSV מציגים את אותו חיוב. מופעל ב־`addExpense` אחרי בדיקת `externalId` המדויקת.
- **Merchant sanitization** ([src/lib/sanitize.ts](src/lib/sanitize.ts)): `sanitizeMerchant("שופרסל דיל סניף 123") === "שופרסל"`. עובד דרך טבלת brand canonicals (שופרסל, רמי לוי, סופר פארם, פז, Apple, Netflix, ZARA, חברת חשמל, סלקום וכד'), ואז strip של noise tokens (DEAL/EXPRESS/ONLINE/בע"מ/סניף NN/store IDs). `merchantKey()` מחזיר נורמליזציה לצורכי השוואה (lowercase, no whitespace/punctuation). הסניטיזציה מוחלת ב־parsers וב־`addExpense` עצמו, כך ש־UI תמיד מציג שם נקי. בדיקות ב־[tests/sanitize.test.ts](tests/sanitize.test.ts).
- **SMS edge cases** ([helpers.ts](src/lib/parsers/helpers.ts)): `detectsRefund` (זיכוי / החזר / REFUND / CREDIT) → `isRefund: true` ב־`ExpenseEntry`. `detectsPending` (תלוי ועומד / ממתין לאישור / PENDING) → `pending: true`. `detectsForeignCurrency` (USD / EUR / GBP) → `currency` ב־`ExpenseEntry`; SMS שכוללים גם `ש"ח` וגם `$` עדיין מסומנים כ־FX. בדיקות ב־[tests/parser-edge-cases.test.ts](tests/parser-edge-cases.test.ts).
- **Schema v3 → v4**: נוספו `isRefund?`, `pending?`, `currency?` ל־`ExpenseEntry`. שדות אופציונליים, אז מיגרציה אוטומטית.

## Tap-to-Pulse — Web Push category prompt

זרימה (כל פעם שמגיע SMS חיוב):

```
SMS → iOS Shortcut → POST /api/webhooks/transactions  (Node runtime)
       → parseSms → ZADD KV → sendCategorizePush(VAPID)
                                       ↓
iPhone PWA → SW push event → showNotification(food/transport actions)
       → notificationclick → POST /api/push/categorize  (Edge)
                                       ↓
                       KV: sally:cat:<deviceId>:<externalId>
       sync route reads override and overlays on the queued tx before
       returning to the PWA. Auto-sync hook applies it via addExpense.
```

קבצים מרכזיים:

- [src/lib/push-server.ts](src/lib/push-server.ts) — wrapper על `web-push` (Node-only). `sendCategorizePush()` מחזיר `{ ok, gone }`; `gone=true` למחוק את ה־subscription.
- [src/app/api/push/subscribe/route.ts](src/app/api/push/subscribe/route.ts) (Edge) — POST שומר `endpoint+keys`, DELETE מסיר. KV key: `sally:push:<deviceId>`.
- [src/app/api/push/categorize/route.ts](src/app/api/push/categorize/route.ts) (Edge) — שומר `category` ב־`sally:cat:<deviceId>:<externalId>` (TTL 7 ימים).
- [src/app/api/transactions/sync/route.ts](src/app/api/transactions/sync/route.ts) — לפני החזרה, קורא overrides ב־`readCategoryOverride` ומשרשר אותם.
- [public/sw.js](public/sw.js) — `push` handler מציג notification עם 2 actions (iOS תקרה); `notificationclick` שולח את ה־category ל־`/api/push/categorize` עם `x-sally-device` שהגיע ב־payload.
- [src/components/settings/push-toggle.tsx](src/components/settings/push-toggle.tsx) — UI לצרכן: בודק תמיכה, מבקש הרשאה, נרשם דרך VAPID public key.

**מגבלות iOS**: Web Push דורש iOS 16.4+ + הוספת ה־PWA ל־Home Screen. הדפדפן הוא Safari דרך WebKit. iOS מאפשר עד 2 action buttons; בחרנו `food` ו־`transport` כפעולות גלויות; `other` הוא ברירת המחדל ל־tap על ה־body.

## Audio chime ([src/lib/chime.ts](src/lib/chime.ts))

`playSyncChime()` — Web Audio synth שני oscillators (E5 + B5) דרך master gain ב־8%. נורה אחרי AutoSync שהכניס לפחות עסקה אחת חדשה ו־`audioEnabled` true. ב־[settings/audio-toggle.tsx](src/components/settings/audio-toggle.tsx) toggle + כפתור "השמע" לדגימה.

## Statement Importer ([src/components/settings/statement-import.tsx](src/components/settings/statement-import.tsx))

ייבוא היסטוריה ידני מ־CSV של אזור אישי בחברת אשראי — תחליף ל־Open Banking שאינו זמין לפרטיים בארץ.

- [parseStatementCsv](src/lib/parsers/statement-csv.ts) — generic CSV parser שמדלג על preamble, מזהה headers בעברית/אנגלית (תאריך/Date, סכום/Amount, בית עסק/Merchant, כרטיס/Card), מחזיר `StatementRow[]`.
- UI: בחירת issuer (CAL/MAX), העלאת CSV (cap 1MB), preview של עד 30 שורות, אישור — קורא ל־`addExpense({ source: "auto", externalId })` עם `externalId` דטרמיניסטי `import:<issuer>:<date>:<amount>:<merchant>` כך שייבוא חוזר של אותו דף לא כופל.
- בדיקות ב־[tests/statement-csv.test.ts](tests/statement-csv.test.ts).

## Why we don't (yet) integrate with Open Banking / Plaid

- **Plaid לא תומך בבנקים ישראלים.** US/Canada/UK/EU בלבד.
- **CAL/MAX/Isracard לא חושפים API צרכני.** הגישה רק דרך תקן Open Banking של בנק ישראל (PSD2-style מ־2022).
- **גישה ל־API דורשת רישום כ־TPP מורשה** — תהליך רגולטורי 6-12 חודשים, ביטוח, ISO 27001. לא בר-ביצוע למפתח יחיד.
- **אגרגטורים מורשים** (RiseUp, Pinsight, Open Finance) לא חושפים API ציבורי.
- **המסלול שאנחנו עליו** (SMS → iOS Shortcut → Webhook + Statement CSV import) נותן 80% מהערך ללא חסם רגולטורי.
- אם בעתיד יקום aggregator ישראלי B2B, ה־interface ב־[src/lib/open-banking.ts](src/lib/open-banking.ts) מוכן — להוסיף provider חדש תחת `src/lib/providers/`.

## Security posture

- **TLS:** Vercel terminates HTTPS. [postExpense](src/lib/api.ts) דוחה endpoints שאינם HTTPS בפרודקשן.
- **HSTS + headers:** [next.config.ts](next.config.ts) מחזיר `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` שמכבה camera/microphone/geolocation.
- **At-rest:** Upstash AES-256 by default. Vercel env vars מוצפנים at-rest.
- **Webhook auth:** Bearer + constant-time compare + deviceId whitelist + zod parse + 16KB body cap.
- **Idempotency:** SHA-256 דטרמיניסטי `externalId` מונע double-charge.
- **Device ID rotation:** [src/lib/device-id.ts](src/lib/device-id.ts) שומר `createdAt` ב־localStorage. אחרי 90 יום מציג banner ב־[IntegrationInfo](src/components/settings/integration-info.tsx) להזכיר רוטציה. רוטציה דורשת עדכון ה־Shortcut ב־iPhone.
- **Threat model**: דליפת `WEBHOOK_SECRET` או `deviceId` מאפשרת הזנת transactions מזויפות. שניהם יושבים ב־iPhone של המשתמש בלבד; ללא MFA כי אין מצב multi-user. **כשנפתח multi-user — להפעיל Clerk** (כבר מותקן feature-flagged).

## Roadmap

- Web Push notifications במקום polling.
- מנפיקים נוספים (ישראכרט / אמריקן אקספרס): להוסיף `src/lib/parsers/<issuer>.ts`.
- Multi-device sync ב־DB (כיום deviceId הוא per-browser/per-device).
- Apple Pay אינו חושף API — כל פתרון קליטה עתידי חייב מקור עקיף (SMS / Statement CSV / Open Banking דרך TPP).
