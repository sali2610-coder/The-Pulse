// Page-level auth gate + host canonicalization + Supabase session refresh.
//
// 1) Host canonicalization (production only):
//    Vercel exposes the same deployment under multiple aliases (preview
//    hashes, per-deployment URLs, etc.). Supabase Auth derives the OAuth
//    `redirect_uri` from the incoming request host, so a user landing on
//    a non-canonical alias would generate a redirect_uri Supabase / Google
//    don't know about → `redirect_uri_mismatch`. We 308 every non-
//    canonical production host to the canonical one BEFORE the OAuth flow.
//
// 2) Supabase session refresh:
//    `createServerClient` from @supabase/ssr can refresh the JWT cookies
//    on every request. Middleware is the canonical place because it
//    runs ONCE per request and can mutate the outgoing response cookies.
//
// 3) Auth gate:
//    Protected paths (everything except PUBLIC_PATHS + /_next + /api/*)
//    redirect to / when no Supabase session cookie is present.

import { NextResponse, type NextRequest } from "next/server";

import { getMiddlewareClient } from "@/lib/supabase/server-client";

const HAS_SUPABASE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const CANONICAL_HOST = "the-pulse-sooty.vercel.app";

const PUBLIC_PATHS = ["/", "/lite", "/reset", "/healthz"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/icon")) return true;
  if (pathname === "/sw.js") return true;
  return false;
}

function shouldCanonicalize(hostname: string, pathname: string): boolean {
  if (hostname === CANONICAL_HOST) return false;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  ) {
    return false;
  }
  if (pathname.startsWith("/api/webhooks/")) return false;
  return true;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const hostname = req.nextUrl.hostname;

  // 1) Host canonicalization.
  if (shouldCanonicalize(hostname, pathname)) {
    const target = new URL(req.nextUrl.toString());
    target.host = CANONICAL_HOST;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  // Build the outgoing response up front so the Supabase client can
  // attach refreshed cookies to it.
  const res = NextResponse.next();

  if (!HAS_SUPABASE) return res;

  // 2) Session refresh — touch getUser() so @supabase/ssr writes the
  //    refreshed JWT back into the response cookies if it expired.
  const client = getMiddlewareClient(req, res);
  if (!client) return res;
  const {
    data: { user },
  } = await client.auth.getUser();

  // 3) Auth gate.
  if (isPublic(pathname)) return res;
  if (pathname.startsWith("/api/")) return res;
  if (user) return res;

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|icon|api/webhooks).*)",
  ],
};
