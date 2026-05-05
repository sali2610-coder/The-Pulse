// Server-side helper to derive the right Scope for a request.
//
// In multi-user mode, the user must be signed into Clerk; we use the userId
// from the session. The `x-sally-device` header is ignored because we do not
// trust client-supplied identifiers for data lookup.
//
// In legacy single-user mode, we fall back to the deviceId header.

import { auth } from "@clerk/nextjs/server";
import { AUTH_ENABLED } from "@/lib/auth-config";
import type { Scope } from "@/lib/scope";

const MAX_DEVICE_ID_LEN = 128;

export type ScopeError = { ok: false; status: number; code: string };
export type ScopeOk = { ok: true; scope: Scope };

export async function resolveRequestScope(
  req: Request,
): Promise<ScopeOk | ScopeError> {
  if (AUTH_ENABLED) {
    const a = await auth();
    if (!a.userId) {
      return { ok: false, status: 401, code: "unauthenticated" };
    }
    return { ok: true, scope: { kind: "user", id: a.userId } };
  }

  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !/^[A-Za-z0-9_\-:.]+$/.test(deviceId)
  ) {
    return { ok: false, status: 400, code: "invalid_device" };
  }
  return { ok: true, scope: { kind: "device", id: deviceId } };
}
