// NextAuth catch-all handler.
//
// NextAuth requires `AUTH_SECRET` to be set even before any provider is
// usable. We gate the handlers behind `isAuthEnabled()` so a deployment
// without Google credentials returns a friendly 503 instead of throwing
// a 500 from `/api/auth/signin` and `/api/auth/session`.

import type { NextRequest } from "next/server";
import { handlers, isAuthEnabled } from "@/lib/auth/config";

function disabled(): Response {
  return Response.json(
    {
      ok: false,
      error: "auth_disabled",
      message:
        "Google OAuth is not configured. Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET on Vercel to enable.",
    },
    { status: 503 },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthEnabled()) return disabled();
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isAuthEnabled()) return disabled();
  return handlers.POST(req);
}
