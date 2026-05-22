// Server-side Supabase sign-out.
//
// Clears the cookies via `auth.signOut()`. POST-only so a stray GET
// (e.g. a prefetch) can't terminate the session. Redirects to `/`
// regardless of the underlying result — sign-out is end-state idempotent.

import { NextResponse, type NextRequest } from "next/server";

import {
  getServerClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  if (isSupabaseServerConfigured()) {
    const client = await getServerClient();
    await client.auth.signOut().catch(() => undefined);
  }
  return NextResponse.redirect(new URL("/", url), { status: 303 });
}
