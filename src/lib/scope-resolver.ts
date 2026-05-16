// Resolve the request's Scope.
//
// Auth is disabled — always fall back to the legacy single-user device
// scope based on the `x-sally-device` header.  No Clerk import: the
// `@clerk/nextjs/server` module was destabilising the edge runtime when
// `pk_test_…` keys were configured. Re-introduce a multi-user branch in
// a separate file/module if/when Clerk is rewired.

import type { Scope } from "@/lib/scope";

const MAX_DEVICE_ID_LEN = 128;

export type ScopeError = { ok: false; status: number; code: string };
export type ScopeOk = { ok: true; scope: Scope };

export async function resolveRequestScope(
  req: Request,
): Promise<ScopeOk | ScopeError> {
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
