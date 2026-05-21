// Supabase client factory.
//
// Reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
// from the environment. When either is missing the client is
// reported as unconfigured and every downstream consumer is expected
// to degrade gracefully — sync becomes a no-op, auth UI hides the
// Supabase sign-in surface, and the existing local-first flows keep
// working.
//
// Production-foundation mandate compliance:
//   ✓ Zero impact on existing flows when env is unset.
//   ✓ No secrets shipped to the client — only the anon key (which
//     is RLS-gated by definition).
//   ✓ Singleton client per browser tab to avoid duplicate websocket
//     subscriptions on hot reload.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

let cached: SupabaseClient<Database> | null = null;

export type SupabaseClientStatus = {
  configured: boolean;
  url: string | null;
};

function readEnv(): SupabaseClientStatus & { anonKey: string | null } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_KEY ??
    null;
  return {
    configured: Boolean(url && anonKey),
    url,
    anonKey,
  };
}

/** True when both env vars are present. UI can use this to decide
 *  whether to expose Supabase sign-in vs the existing Google flow. */
export function isSupabaseConfigured(): boolean {
  return readEnv().configured;
}

export function getSupabaseStatus(): SupabaseClientStatus {
  const env = readEnv();
  return { configured: env.configured, url: env.url };
}

/** Lazy singleton. Returns null when unconfigured so callers can
 *  early-return rather than throw on a missing env var. */
export function supabase(): SupabaseClient<Database> | null {
  if (cached) return cached;
  const env = readEnv();
  if (!env.configured || !env.url || !env.anonKey) return null;
  cached = createClient<Database>(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "sally.supabase.session",
    },
  });
  return cached;
}

/** Test/dev helper — resets the singleton so a re-configured env
 *  takes effect without a page reload. */
export function _resetSupabaseClientForTests(): void {
  cached = null;
}
