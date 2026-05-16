import { NextResponse } from "next/server";

// Auth is disabled. Middleware is a no-op pass-through so the app serves
// every route as a public single-user app. Clerk is intentionally NOT
// imported here — even a top-level import was crashing the prod runtime
// when `pk_test_…` keys were in play. Re-enable later by wiring Clerk
// behind a runtime AUTH_ENABLED flag again.

export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
