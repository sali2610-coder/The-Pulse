// Server-side Supabase client.
//
// Reads the session from Next.js cookies (set by the OAuth callback
// handler) so route handlers, server components, and middleware all
// see the SAME user. Uses the anon key only — RLS protects every
// row, server code never bypasses with service-role.
//
// Each factory variant exists because Next.js exposes cookies
// differently in each context:
//   - getServerClient()        → route handlers + server components
//                                (read-write cookies via next/headers)
//   - getMiddlewareClient(req, res) → middleware (mutates the
//                                outgoing NextResponse cookies)
//
// All three share the same auth state because they read the same
// cookie names.
//
// Server-only file — never imported from a "use client" module.
//
// Cookie security: SECURE flag is true in prod, SAMESITE=Lax, HTTPONLY
// is automatic on Supabase auth cookies that carry the JWT.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import type { Database } from "./types";

function readEnv(): { url: string | null; anonKey: string | null } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  };
}

export function isSupabaseServerConfigured(): boolean {
  const e = readEnv();
  return Boolean(e.url && e.anonKey);
}

/** Server-component / route-handler client. Reads + writes cookies
 *  through next/headers. Throws if env isn't configured — callers
 *  should gate on `isSupabaseServerConfigured()` first. */
export async function getServerClient() {
  const env = readEnv();
  if (!env.url || !env.anonKey) {
    throw new Error("supabase_not_configured");
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `cookies().set()` throws when called from a Server
          // Component — that's expected. The middleware path is the
          // canonical place to refresh cookies.
        }
      },
    },
  });
}

/** Middleware client. Receives the incoming request + the response
 *  the middleware is about to return. Cookies set via `setAll` mutate
 *  the outgoing response so the browser receives a refreshed JWT. */
export function getMiddlewareClient(req: NextRequest, res: NextResponse) {
  const env = readEnv();
  if (!env.url || !env.anonKey) return null;
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        }
      },
    },
  });
}

/** Convenience: server-side "who is the signed-in user". Returns
 *  null when no session OR Supabase isn't configured. Verified via
 *  `getUser()` which re-validates the JWT against Supabase — safer
 *  than trusting `getSession()` (which only reads the cookie). */
export async function getServerUser(): Promise<{
  id: string;
  email: string | null;
} | null> {
  if (!isSupabaseServerConfigured()) return null;
  const client = await getServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
