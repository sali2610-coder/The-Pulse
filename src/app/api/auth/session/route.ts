// Supabase session reporter.
//
// Returns the same `{ user: { id, email } }` shape the legacy NextAuth
// endpoint surfaced so client callers (header avatar, remote-state-sync,
// safety diagnostics) don't need per-consumer migrations.
//
// Cookie-backed — reads the Supabase JWT via the server-client helper.

import {
  getServerUser,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!isSupabaseServerConfigured()) {
    return Response.json({});
  }
  const user = await getServerUser();
  if (!user) return Response.json({});
  return Response.json({
    user: { id: user.id, email: user.email },
  });
}
