// Phase 252 — text/plain Shortcut adapter.
//
// The full /api/webhooks/transactions endpoint expects a JSON body.
// iOS Shortcuts can do that, but the user must hand-edit a JSON
// template + interpolate the Notification Body variable into the
// right field. That trips up non-technical users.
//
// This adapter accepts the raw notification text as a plain-text
// body and rebuilds the JSON server-side, then forwards to the
// real handler. The user's Shortcut becomes:
//
//   POST  <origin>/api/webhooks/transactions/shortcut
//   Headers: Authorization: Bearer <token>
//            Content-Type: text/plain
//   Body:    <Notification Body magic variable>
//
// No JSON, no field interpolation. Bearer auth + the rest of the
// pipeline are unchanged because we delegate to the same route.

import { POST as canonicalPOST } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LEN = 2_000;

export async function POST(req: Request): Promise<Response> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json(
      { ok: false, error: "body_read_failed" },
      { status: 400 },
    );
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return Response.json(
      { ok: false, error: "empty_body" },
      { status: 400 },
    );
  }
  if (trimmed.length > MAX_TEXT_LEN) {
    return Response.json(
      { ok: false, error: "body_too_long", limit: MAX_TEXT_LEN },
      { status: 413 },
    );
  }

  // Build the JSON payload the canonical handler expects.
  const payload = {
    issuer: "shortcut" as const,
    rawText: trimmed,
    receivedAt: Date.now(),
    appSource: "unknown" as const,
  };

  // Re-issue the request with the JSON body + same auth headers.
  // We preserve x-sally-device + Authorization so the canonical
  // route's scope resolution + Bearer check work identically.
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  const inner = new Request(req.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return canonicalPOST(inner);
}

export function GET(): Response {
  return Response.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405 },
  );
}
