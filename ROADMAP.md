# Pulse · Roadmap

Deferred feature ideas — do NOT implement until v1.0 polish is
locked. Every entry is intentionally left as a description, not
a spec, so the design can breathe when the sprint opens.

## After v1.0 Ship

### AI CFO
A conversational sheet ("שאל את Sally") that reads store selectors +
liquidity curve context and answers open questions: "כמה נשאר לי לפני
סוף החודש?", "מה יקרה אם אקח משכנתא של 4,000?", "איפה הכי חרגתי
החודש?". LLM stream, tone-aware answers, no data leaves device unless
opted in.

### Command Palette (⌘K)
System-wide launcher. Quick expense, quick income, tab jumps, deep
navigation ("open card CAL 4127", "add subscription נטפליקס"). Fuzzy
match on merchants, categories, rules. Keyboard-first; Cmd+K on
desktop, edge-swipe from top on mobile.

### Widget Mode
iOS / Android home-screen widget. Live balance + upcoming charge +
tone dot. Tap → open Sally on the relevant screen. Zero-input glance
value.

### Category Health Scores
Every category gets a 0–100 score derived from anomaly detection
(pace vs prior 3 months, one-off spikes, subscription drift).
Insights tab surfaces the three weakest categories with a
one-sentence "why".

### Time Machine Pro — What-If Scrubber
Add a virtual charge/income directly on the balance river; the curve
updates live as the user drags the amount. Save → makes it real,
discard → clean revert. Turns Time Machine into a planning tool, not
just a viewer.

### Split Payments
Mark an expense as "shared with partner", automatic settle-up view
per month, one-tap request-to-pay. No accounts / auth needed at
first — just per-user config on the same device.

### Confetti Success
When a savings goal is hit / a loan is paid off / the user closes
their first month under budget → confetti spring + tone-tinted
success haptic + a clear moment of joy. One-time per milestone.

### Weekly Digest Push
Every Friday morning → tone-summarized card ("השבוע הוצאת ₪1,247 ·
12% מתחת לממוצע · חסכת מספיק לסוף חודש שקט"). Deep-links to the
relevant delta on Time Machine.

### Onboarding Premium
Hero animation "Sally learns your money" → import CSV / SMS
Shortcut / manual first row → set incomes → set budget. Goal: 60
seconds to value.

### Motion Presets
User picks Silent / Balanced / Playful. Silent maps to reduced
motion. Playful adds bounce springs on tile presses, confetti on
success. Persisted per device.

### Split-Budget Mode
Household mode. Two people, shared budget, separate personal
allowance. Requires cloud sync + accounts; parked behind auth.

### AI Suggestions
Weekly "quick wins": subscriptions that drifted up, categories
where you overpaid vs typical merchants, side-hustle income
opportunities based on cash flow gaps. Every suggestion is
dismissable and never mutates state without explicit consent.

## Guiding Principles

1. **Ship polish before features.** v1.0 is a mood, not a spec.
2. **Every new surface reuses the design system.** No bespoke
   radius / shadow / gradient outside `.set-*`, `.cc-*`,
   `.tp-*`, `.ln-*`, `.in-*`, `.bc-*`, `.ac-*`, `.fs-*`.
3. **Nothing autoruns.** AI / suggestions / confetti all require
   an explicit user action or an opt-in preference.
4. **Every mutation stays local until proven safe.** Even
   long-form AI stays offline-first.

## Not on the Roadmap (Explicitly)

- Multi-tenant / multi-family in v1. Auth is single-user for now.
- Investment tracking. Sally is a spending tool.
- Foreign-currency accounts as first class. FX is a v2 topic.
