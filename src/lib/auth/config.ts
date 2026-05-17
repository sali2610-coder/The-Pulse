// NextAuth v5 (Auth.js) configuration — Google-only OAuth, KV-backed.
//
// Required env (set on Vercel):
//   AUTH_SECRET            — `openssl rand -base64 32`
//   AUTH_GOOGLE_ID         — OAuth client id from Google Cloud Console
//   AUTH_GOOGLE_SECRET     — OAuth client secret
//   AUTH_TRUST_HOST=true   — only when deploying outside Vercel
//
// When AUTH_GOOGLE_ID is absent (the case on first deploy after this
// commit), the Google provider is omitted and `isAuthEnabled()` reports
// false. The rest of the app keeps running in single-user device-id mode.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { KvAdapter } from "@/lib/auth/kv-adapter";
import {
  getUserState,
  isKvConfigured,
  saveUserState,
  kv,
  type StateBlob,
} from "@/lib/kv";

const HAS_GOOGLE_KEYS = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/** True when Google OAuth credentials are present on the server.
 *  Client code reads this via /api/auth/status to decide whether to
 *  show the "Sign in with Google" CTA. */
export function isAuthEnabled(): boolean {
  return HAS_GOOGLE_KEYS && isKvConfigured();
}

const providers = HAS_GOOGLE_KEYS
  ? [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        // Account-chooser every login → users with multiple Google
        // accounts can pick.
        authorization: {
          params: { prompt: "select_account", access_type: "offline" },
        },
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // KV adapter only when KV is configured AND Google is set. Otherwise
  // NextAuth falls back to its in-memory JWT mode which still works for
  // dev but doesn't persist across requests.
  adapter: isAuthEnabled() ? KvAdapter() : undefined,
  session: {
    strategy: isAuthEnabled() ? "database" : "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    // Inject userId into the session so server routes can read it
    // without an extra DB lookup.
    async session({ session, user, token }) {
      if (user?.id) {
        session.user.id = user.id;
      } else if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    /** First-time sign-in migration. When NextAuth creates a new user
     *  record, look up any state blob still living under the user's
     *  device id and copy it across. Idempotent — subsequent sign-ins
     *  no-op because the user blob already exists. */
    async createUser({ user }) {
      if (!isKvConfigured()) return;
      if (!user.id) return;
      const existing = await getUserState({ kind: "user", id: user.id });
      if (existing) return; // already migrated
      // Pull the most recent device-id claim recorded against this
      // user (set via /api/auth/claim-device shortly after sign-in).
      const deviceId = await kv().get(`sally:auth:user-device:${user.id}`);
      if (typeof deviceId !== "string" || !deviceId) return;
      const deviceBlob = await getUserState({ kind: "device", id: deviceId });
      if (!deviceBlob) return;
      const migrated: StateBlob = {
        version: deviceBlob.version,
        updatedAt: Date.now(),
        state: deviceBlob.state,
      };
      await saveUserState({ kind: "user", id: user.id }, migrated);
    },
  },
});
