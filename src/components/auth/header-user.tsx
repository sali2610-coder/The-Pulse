"use client";

import { UserButton } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/auth-config";

/**
 * Renders the Clerk UserButton (avatar + sign-out menu) when multi-user
 * auth is enabled. In single-user mode this is a no-op.
 */
export function HeaderUser() {
  if (!AUTH_ENABLED) return null;
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "size-8 rounded-full ring-1 ring-white/10",
        },
      }}
    />
  );
}
