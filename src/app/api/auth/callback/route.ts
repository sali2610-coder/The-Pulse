// Supabase OAuth callback handler.
//
// Supabase redirects here with `?code=…` after the user grants
// consent on Google. We exchange the code for a session via
// `client.auth.exchangeCodeForSession(code)` — this sets the
// httpOnly session cookies via the server-client cookie adapter,
// then redirects to the final destination (`?next=…` or `/`).
//
// The browser-side supabase() also picks up the session via
// detection on the next page load, so client code sees the session
// without an extra getSession() call.

import { NextResponse, type NextRequest } from "next/server";

import {
  getServerClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  // Only honor same-origin relative paths to prevent open redirects.
  const next =
    typeof nextParam === "string" &&
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//")
      ? nextParam
      : "/";

  if (!isSupabaseServerConfigured()) {
    return NextResponse.redirect(new URL("/?auth_error=not_configured", url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=no_code", url));
  }

  const client = await getServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/?auth_error=${encodeURIComponent(error.message)}`,
        url,
      ),
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
