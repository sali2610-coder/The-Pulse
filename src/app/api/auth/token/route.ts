// Auth disabled. Personal API token CRUD only made sense in multi-user
// mode where Clerk attributed each request to a user. With auth gone the
// app uses the global WEBHOOK_SECRET for ingestion, so this endpoint
// returns a static 503 until multi-user mode is restored.

export const runtime = "edge";
export const dynamic = "force-dynamic";

function disabled(): Response {
  return Response.json(
    { ok: false, error: "auth_disabled" },
    { status: 503 },
  );
}

export function GET(): Response {
  return disabled();
}

export function POST(): Response {
  return disabled();
}

export function DELETE(): Response {
  return disabled();
}
