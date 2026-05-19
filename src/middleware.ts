// Page-level auth gate + host canonicalization.
//
// 1) Host canonicalization (production only):
//    Vercel exposes the same deployment under multiple aliases
//    (`the-pulse-sooty.vercel.app`, `the-pulse-sali2610-coders-projects.vercel.app`,
//    `the-pulse-git-main-...`, preview hashes). NextAuth derives the
//    OAuth `redirect_uri` from the incoming request host, so a user
//    landing on a non-canonical alias would generate a redirect_uri the
//    Google Console doesn't know about → `redirect_uri_mismatch`.
//    Fix: 308 every non-canonical production host to the canonical one
//    BEFORE the OAuth flow starts. Method-preserving so a POST that
//    happens to hit the wrong alias still completes correctly.
//
// 2) Auth gate (unchanged):
//    When Google OAuth is configured and the caller has no NextAuth
//    session, redirect protected pages to the welcome screen. Root page
//    self-gates; this catches /setup/*, /confirm/*, /debug.

import { NextResponse, type NextRequest } from "next/server";

const HAS_GOOGLE_KEYS = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const CANONICAL_HOST = "the-pulse-sooty.vercel.app";

// Paths the middleware lets through even without a session.
const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/lite",
  "/reset",
  "/healthz",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/sign-in/")) return true;
  if (pathname.startsWith("/sign-up/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/icon")) return true;
  if (pathname === "/sw.js") return true;
  return false;
}

/** True when the host is an alternate Vercel alias that should funnel
 *  to the canonical OAuth host. Skips ONLY localhost (dev). Every
 *  vercel.app host that isn't the canonical one — including preview
 *  hashes and the per-deployment URL — gets redirected, because
 *  NextAuth would otherwise derive a redirect_uri Google Console hasn't
 *  registered. */
function shouldCanonicalize(hostname: string, pathname: string): boolean {
  if (hostname === CANONICAL_HOST) return false;
  // Local dev / 127.0.0.1 keeps working.
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  ) {
    return false;
  }
  // Webhooks are pinned by URL in prod-config.ts and POST from external
  // clients (iPhone Shortcut) that may not follow redirects reliably.
  if (pathname.startsWith("/api/webhooks/")) return false;
  return true;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const hostname = req.nextUrl.hostname;

  // 1) Host canonicalization — happens BEFORE auth checks so even the
  //    public welcome screen serves under the canonical host.
  if (shouldCanonicalize(hostname, pathname)) {
    const target = new URL(req.nextUrl.toString());
    target.host = CANONICAL_HOST;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  if (!HAS_GOOGLE_KEYS) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const hasSession =
    req.cookies.has("__Secure-authjs.session-token") ||
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token") ||
    req.cookies.has("next-auth.session-token");

  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Now covers /api/auth/* so non-canonical hosts get redirected
  // BEFORE NextAuth derives a wrong redirect_uri. Still excludes
  // /api/webhooks (iPhone Shortcut) and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|icon|api/webhooks).*)",
  ],
};
