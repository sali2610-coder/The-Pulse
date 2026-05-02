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
- **פונטים:** Heebo (sans, hebrew+latin) + JetBrains Mono (numbers).
- **צבעי מותג:** Charcoal `#0A0A0A`, Surface `#1A1A1A`, Neon `#00E5FF`, Gold `#D4AF37` — מוגדרים תחת `.dark` ב־[globals.css](src/app/globals.css).

## Architecture

### Data model ([src/types/finance.ts](src/types/finance.ts))

- **`ExpenseEntry`** — רשומת הוצאה (manual/auto), עם `amount`, `installments`, `paymentMethod` (`cash`/`credit`), ו־`chargeDate`. תשלום חודשי = `amount/installments`, מתחיל מ־chargeDate.
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
- **Migration v1→v2**: מילוי `paymentMethod: "credit"` ברשומות ישנות, ו־`monthlyBudget: 0`.

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
npm install         # להתקנה ראשונה
npm run dev         # שרת פיתוח (Turbopack) על http://localhost:3000
npm run build       # production build
npm run start       # להריץ build בצורת prod
npm run lint        # ESLint flat config (eslint.config.mjs)
npx tsc --noEmit    # type-check ללא emit (אין script ייעודי)
```

אין framework טסטים מוגדר עדיין. אם מוסיפים — לעדכן כאן.

## Environment

קובץ [.env.local](.env.local) חייב להכיל את ה־endpoint של ההוצאות:

```
NEXT_PUBLIC_EXPENSE_ENDPOINT=https://your-endpoint.example.com/api/expenses
```

שימושי ל־dev: [webhook.site](https://webhook.site) — מספק URL חינמי שמאפשר לראות payloads בזמן אמת. ה־prefix `NEXT_PUBLIC_` נחוץ כי הקריאה מתבצעת מה־client.

## Notes for Claude

- העבודה מצומצמת לתיקייה הזו בלבד — אין לגעת בקבצים מחוצה לה (memory rule).
- **Tailwind v4 — אין `tailwind.config.ts`.** כל ה־theme tokens חיים ב־[src/app/globals.css](src/app/globals.css) תחת `@theme inline` ו־`.dark`. הוספת token חדש = הוספת CSS variable ב־`.dark` + מיפוי תחת `@theme inline`.
- **shadcn add** ל־`base-nova` style: יש components שלא קיימים תחת השם המקובל (למשל `form` לא נוצר בהוספה רגילה). בנינו את הטופס ישירות מעל `react-hook-form` ללא wrapper של shadcn.
- **RTL:** ה־`<html dir="rtl">` קבוע ב־[layout.tsx](src/app/layout.tsx). כשכותבים flex/grid להעדיף `start/end` במקום `left/right`. מספרים שצריכים להיראות LTR (סכומים, ₪) דורשים `dir="ltr"` מקומי.
- **React 19 + React Compiler:** ESLint כאן אוסר `setState` סינכרוני בתוך `useEffect`. אם מתעורר צורך — להעביר ל־event handler או לעטוף ב־`onOpenChange` של הרכיב.
- **localStorage hydration**: `useFinanceStore.persist` מציב `hasHydrated=true` רק אחרי טעינה. לפני זה, חישובים מבוססי־store חייבים להחזיר ערכי ברירת מחדל (0/ריק) כדי למנוע SSR mismatch.
- **Roadmap (מחוץ ל־scope נוכחי):** קליטת Auto entries מ־Open Banking (כשתהיה — יקראו `addExpense({ source: "auto" })` והשידוך יתפוס אותם), DB אמיתי שיחליף את ה־localStorage, היסטוריית עסקאות, WhatsApp notifications, PWA. Apple Pay אינו חושף API לקריאת עסקאות — כל פתרון קליטה עתידי חייב מקור עקיף (SMS / API בנק / Open Banking).
