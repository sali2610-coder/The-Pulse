// Auth is intentionally disabled at the app level. Every code path that
// previously branched on `AUTH_ENABLED` now reads `false` unconditionally
// — Clerk imports were destabilising production in test-mode and the
// rebuild plan is to re-introduce auth behind a separate module so a flag
// flip doesn't change the import graph.
//
// Do NOT re-derive this from `process.env.NEXT_PUBLIC_AUTH_ENABLED` until
// the auth rewrite lands. Hard-coded `false` keeps the bundle stable.

export const AUTH_ENABLED = false as const;
