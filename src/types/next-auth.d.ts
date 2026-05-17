// Augment next-auth's `Session` so `session.user.id` is typed everywhere
// without a per-call cast. The id is injected by the `session` callback
// in src/lib/auth/config.ts and is the same string the KV adapter uses
// to key per-user data.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}
