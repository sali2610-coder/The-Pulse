import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth-config";

// Routes that NEVER require auth (webhooks, manifest, icons, sign-in pages).
const isPublic = createRouteMatcher([
  "/api/webhooks/(.*)",
  "/api/transactions/(.*)",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/sw.js",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  await auth.protect();
});

export default function middleware(req: NextRequest) {
  if (!AUTH_ENABLED) {
    return NextResponse.next();
  }
  return clerk(req, {} as never);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and most static files.
    "/((?!_next|.*\\..*).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
