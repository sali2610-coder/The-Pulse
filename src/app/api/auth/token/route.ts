import { auth } from "@clerk/nextjs/server";
import {
  getUserToken,
  rotateUserToken,
  revokeUserToken,
} from "@/lib/api-token";
import { isKvConfigured } from "@/lib/kv";
import { AUTH_ENABLED } from "@/lib/auth-config";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

async function requireUserId(): Promise<string | Response> {
  if (!AUTH_ENABLED) return fail(503, "auth_disabled");
  const a = await auth();
  if (!a.userId) return fail(401, "unauthenticated");
  return a.userId;
}

export async function GET(): Promise<Response> {
  const userOr = await requireUserId();
  if (typeof userOr !== "string") return userOr;
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  const token = await getUserToken(userOr);
  return Response.json({ ok: true, token });
}

export async function POST(): Promise<Response> {
  // POST = generate or rotate. Idempotent in the sense that the user always
  // ends up with exactly one token after the call.
  const userOr = await requireUserId();
  if (typeof userOr !== "string") return userOr;
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  const token = await rotateUserToken(userOr);
  return Response.json({ ok: true, token });
}

export async function DELETE(): Promise<Response> {
  const userOr = await requireUserId();
  if (typeof userOr !== "string") return userOr;
  if (!isKvConfigured()) return fail(503, "kv_not_configured");

  await revokeUserToken(userOr);
  return Response.json({ ok: true });
}
