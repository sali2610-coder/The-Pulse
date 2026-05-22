// Read-only auth feature-flag endpoint.
//
// Lets client code ask "is Supabase Auth (and therefore Google OAuth)
// actually configured on this deployment?" without leaking env vars
// or 500ing when credentials are missing.

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return Response.json({ ok: true, authEnabled: configured });
}
