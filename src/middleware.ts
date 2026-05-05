import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth-config";

// Routes that bypass auth even in multi-user mode.
//
// - Webhooks authenticate themselves with a Bearer token (per-user API token
//   in multi-user mode, or the legacy global secret), so they don't need
//   Clerk middleware.
// - The manifest, icons, and SW file must be loadable without a session so
//   "Add to Home Screen" works on iOS before sign-in.
// - Sign-in/up pages obviously need to be reachable when signed-out.
//
// EVERY other route — including /api/transactions/*, /api/push/*, and
// /api/auth/token — is protected and requires a Clerk session.
const isPublic = createRouteMatcher([
  "/api/webhooks/(.*)",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/sw.js",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  await auth.protect();
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // Single-user / legacy mode: no auth wrapping.
  if (!AUTH_ENABLED) return NextResponse.next();
  // Forward both args verbatim so Clerk can use the FetchEvent for
  // waitUntil() telemetry. Passing `{} as never` here breaks the request
  // pipeline and Next renders a 404 for `/`.
  return clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
