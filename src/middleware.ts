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
  "/healthz",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId } = await auth();
  if (userId) return;

  // For API routes, return JSON 401 so client code can handle it.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "unauthenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // For HTML routes, redirect explicitly to /sign-in. We don't use
  // `auth.protect()` because in Clerk test (pk_test_…) mode it issues a
  // `protect-rewrite, dev-browser-missing` rewrite to /_not-found before
  // the dev-browser handshake completes — visitors briefly see a 404.
  const signInUrl = new URL("/sign-in", req.url);
  signInUrl.searchParams.set("redirect_url", req.url);
  return NextResponse.redirect(signInUrl);
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!AUTH_ENABLED) return NextResponse.next();
  return clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
