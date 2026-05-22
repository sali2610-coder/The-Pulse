// Supabase browser client.
//
// Uses `createBrowserClient` from @supabase/ssr so the session lives
// in cookies — readable by middleware + route handlers. This is what
// makes a single sign-in flow propagate from the browser to server
// components without any custom token-passing logic.
//
// Anon key only. RLS protects every row. Service-role is NEVER used
// anywhere in this codebase.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export function isSupabaseConfigured(): boolean {
  return readEnv().configured;
}

export function getSupabaseStatus(): SupabaseClientStatus {
  const env = readEnv();
  return { configured: env.configured, url: env.url };
}

/** Lazy singleton browser client. Cookies-backed session. Returns
 *  null when unconfigured so callers can gracefully degrade. */
export function supabase(): SupabaseClient<Database> | null {
  if (cached) return cached;
  const env = readEnv();
  if (!env.configured || !env.url || !env.anonKey) return null;
  cached = createBrowserClient<Database>(env.url, env.anonKey);
  return cached;
}

export function _resetSupabaseClientForTests(): void {
  cached = null;
}
