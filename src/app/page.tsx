// Root entry — server-side auth gate.
//
// When Google OAuth is configured (`AUTH_GOOGLE_ID/SECRET` present) and the
// caller has no NextAuth session, we render the premium welcome screen
// *instead of* the dashboard. This means an unauthenticated visitor never
// sees the financial UI at all — no flash, no flicker, no exposure of cached
// private data while the client decides what to do.
//
// When AUTH is not configured, the app keeps running in single-user
// device-id mode and renders the full shell as before.

import { auth, isAuthEnabled } from "@/lib/auth/config";
import { AppShell } from "@/components/app/app-shell";
import { WelcomeScreen } from "@/components/auth/welcome-screen";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (isAuthEnabled()) {
    const session = await auth();
    if (!session?.user) {
      return <WelcomeScreen callbackUrl="/" />;
    }
  }
  return <AppShell />;
}
