// Root entry — Supabase-gated.
//
// Supabase Auth (Google OAuth) is the sole identity system. When the
// caller has no Supabase session we render the welcome screen
// instead of the dashboard — no flash, no cached private data
// exposed to an unauthenticated visitor.
//
// When Supabase isn't configured at all (env vars missing), the app
// falls back to single-device mode and renders the full shell.

import { AppShell } from "@/components/app/app-shell";
import { WelcomeScreen } from "@/components/auth/welcome-screen";
import {
  getServerUser,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  if (isSupabaseServerConfigured()) {
    const user = await getServerUser();
    if (!user) {
      const sp = (await searchParams) ?? {};
      const raw = sp.next;
      // Only honor same-origin relative paths to prevent open redirects.
      const next =
        typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
          ? raw
          : "/";
      return <WelcomeScreen next={next} />;
    }
  }
  return <AppShell />;
}
