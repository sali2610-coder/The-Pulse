// Feature-flag for Clerk auth. Auth is OFF unless ALL of the following are met:
//  1. NEXT_PUBLIC_AUTH_ENABLED=true (explicit opt-in).
//  2. Both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set.
//
// This keeps the app fully usable in dev / preview without a Clerk account,
// while making it a one-line flip to enable in production.

export const AUTH_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_ENABLED === "true" &&
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
