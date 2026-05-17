// Read-only auth feature-flag endpoint.
//
// Lets client code (sign-in button, settings card) ask "is Google OAuth
// actually configured on this deployment?" without leaking env vars or
// 500ing when credentials are missing.

import { isAuthEnabled } from "@/lib/auth/config";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    ok: true,
    authEnabled: isAuthEnabled(),
  });
}
