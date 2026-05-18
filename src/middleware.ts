// Page-level auth gate.
//
// When Google OAuth is configured AND the caller has no NextAuth session,
// redirect protected pages to the welcome screen (`/`). The root page
// already gates itself via its own server component; this middleware
// catches the OTHER pages — /setup/*, /confirm/*, /debug — so an
// unauthenticated visitor cannot side-step the gate by typing a URL.
//
// API routes are deliberately NOT gated here:
//   - /api/webhooks/transactions  → iPhone Shortcut, no session ever
//   - /api/push/categorize        → service-worker click, no session
//   - /api/state, /api/transactions/sync, /api/transactions/pending,
//     /api/push/subscribe         → device-id-only paths handled by
//                                    resolveRequestScope, which already
//                                    rejects bare requests it can't bind
//   - /api/auth/*                 → NextAuth handlers themselves
//   - /api/healthz, /healthz      → uptime probes

import { NextResponse, type NextRequest } from "next/server";

const HAS_GOOGLE_KEYS = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

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
  // Allow nested paths under always-public roots.
  if (pathname.startsWith("/sign-in/")) return true;
  if (pathname.startsWith("/sign-up/")) return true;
  // Static assets.
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/icon")) return true;
  if (pathname === "/sw.js") return true;
  return false;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (!HAS_GOOGLE_KEYS) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // NextAuth sets one of these cookies after a successful session. Cheap
  // presence check — we don't need to verify the JWT here, the route's
  // own `auth()` call does the cryptographic check before serving data.
  const hasSession =
    req.cookies.has("__Secure-authjs.session-token") ||
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token") ||
    req.cookies.has("next-auth.session-token");

  if (hasSession) return NextResponse.next();

  // Redirect to welcome with callbackUrl pointing back at the requested
  // page so the user lands where they intended after Google sign-in.
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Cover every route except /api/* (handled by their own scope resolver)
  // and Next internals.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|icon).*)"],
};
