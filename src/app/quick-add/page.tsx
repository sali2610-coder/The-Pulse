// Quick-Add capture page.
//
// Standalone PWA shortcut target. Renders ONLY the floating capture
// overlay — no dashboard, no tabs, no AppShell, no insights panels.
// Boots fast so logging a transaction is "tap shortcut → 3 seconds".
//
// Auth gating: lives behind the same middleware as /confirm. When
// AUTH_GOOGLE_* is configured, unauthenticated users are redirected
// to / and bounced back here via callbackUrl after sign-in.

import { QuickAddClient } from "@/components/quick-add/quick-add-client";

export const dynamic = "force-dynamic";

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    category?: string;
    amount?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  return (
    <QuickAddClient
      initialType={sp.type === "income" ? "income" : "expense"}
      initialCategory={typeof sp.category === "string" ? sp.category : undefined}
      initialAmount={typeof sp.amount === "string" ? sp.amount : undefined}
    />
  );
}
