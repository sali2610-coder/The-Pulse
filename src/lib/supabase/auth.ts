// Supabase auth thin wrapper.
//
// Surface the bits of supabase-js auth we actually use without
// leaking the SupabaseClient through every consumer. Returns a
// uniform `{ ok, error }` shape so UI code doesn't have to think
// about supabase-js response variants.
//
// All methods short-circuit to a structured "not_configured" error
// when the env isn't wired up — production flows hold the line
// without throwing.

import { supabase } from "./client";

export type AuthSession = {
  userId: string;
  email: string | null;
};

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; reason: AuthFailure };

export type AuthFailure =
  | "not_configured"
  | "invalid_credentials"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "unknown";

function classify(message: string | null | undefined): AuthFailure {
  if (!message) return "unknown";
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "invalid_credentials";
  if (m.includes("weak") || m.includes("password should")) return "weak_password";
  if (m.includes("rate")) return "rate_limited";
  if (m.includes("network")) return "network";
  return "unknown";
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult<AuthSession>> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, reason: classify(error.message) };
  const user = data.user;
  if (!user) return { ok: false, reason: "unknown" };
  return {
    ok: true,
    data: { userId: user.id, email: user.email ?? null },
  };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthResult<AuthSession>> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { ok: false, reason: classify(error.message) };
  const user = data.user;
  if (!user) return { ok: false, reason: "unknown" };
  return {
    ok: true,
    data: { userId: user.id, email: user.email ?? null },
  };
}

/** Kick off Google OAuth via Supabase. Default redirect lands on
 *  `/api/auth/callback` which exchanges the OAuth code for a server-
 *  side cookie session — this is what lets server components +
 *  middleware see the same user without any token-passing. After
 *  the round-trip, the user has a Supabase session whose
 *  `auth.uid()` satisfies the RLS policies on every entity table.
 *
 *  ⚠ Supabase dashboard requirement (per environment):
 *     Authentication → URL Configuration → "Redirect URLs"
 *     must include EVERY host the app runs on. If a host is
 *     missing, Supabase silently ignores our `redirectTo` and
 *     302s to the project Site URL root with `?code=` attached.
 *     The middleware in src/proxy.ts catches that root-landing
 *     case and forwards to /api/auth/callback as a safety net.
 *
 *     For local dev: add `http://localhost:3000/api/auth/callback`.
 *     For production: add `https://the-pulse-sooty.vercel.app/api/auth/callback`.
 *     Leave the Site URL pointed at the production canonical host.
 */
export async function signInWithGoogle(redirectTo?: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  // Resolution order: explicit arg → live window origin → env
  // override (server-rendered fallback). Always prefers the host
  // the user is actually browsing so local dev never leaks to
  // the production origin.
  const liveOrigin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = liveOrigin ?? envOrigin;
  const target =
    redirectTo ?? (origin ? `${origin}/api/auth/callback` : undefined);
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: target },
  });
  if (error) return { ok: false, reason: classify(error.message) };
  // signInWithOAuth navigates away — this resolved value is unreachable
  // in practice. Returning ok for type completeness.
  return { ok: true, data: undefined };
}

export async function signOut(): Promise<AuthResult> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const { error } = await client.auth.signOut();
  if (error) return { ok: false, reason: classify(error.message) };
  return { ok: true, data: undefined };
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const client = supabase();
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

/** Subscribe to auth-state changes. Returns an unsubscribe fn.
 *  Calls back with null on sign-out. */
export function onAuthStateChange(
  fn: (session: AuthSession | null) => void,
): () => void {
  const client = supabase();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      fn(null);
      return;
    }
    fn({ userId: session.user.id, email: session.user.email ?? null });
  });
  return () => data.subscription.unsubscribe();
}
