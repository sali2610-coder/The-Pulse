// Minimal Auth.js (NextAuth v5) adapter backed by Upstash KV.
//
// Stores the four shapes NextAuth needs — users, accounts, sessions,
// verificationTokens — as JSON blobs under prefixed keys. No Postgres
// required to ship multi-user; when a Postgres migration lands the
// adapter swaps without touching call sites.

import { kv } from "@/lib/kv";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "@auth/core/adapters";

const P = {
  user: (id: string) => `sally:auth:user:${id}`,
  userByEmail: (email: string) => `sally:auth:user-by-email:${email.toLowerCase()}`,
  accountByProvider: (provider: string, providerAccountId: string) =>
    `sally:auth:account:${provider}:${providerAccountId}`,
  accountsForUser: (userId: string) => `sally:auth:accounts-by-user:${userId}`,
  session: (token: string) => `sally:auth:session:${token}`,
  sessionsForUser: (userId: string) => `sally:auth:sessions-by-user:${userId}`,
  verificationToken: (identifier: string, token: string) =>
    `sally:auth:vt:${identifier}:${token}`,
};

const USER_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year; touched on every use

async function getJson<T>(key: string): Promise<T | null> {
  const v = await kv().get(key);
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

async function setJson(key: string, value: unknown, ttl?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttl !== undefined) {
    await kv().set(key, payload, { ex: ttl });
  } else {
    await kv().set(key, payload);
  }
}

function uid(prefix = "u"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function deserializeUser(user: AdapterUser | null): AdapterUser | null {
  if (!user) return null;
  return {
    ...user,
    emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
  } as AdapterUser;
}

function deserializeSession(s: AdapterSession | null): AdapterSession | null {
  if (!s) return null;
  return { ...s, expires: new Date(s.expires) } as AdapterSession;
}

export function KvAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = uid("u");
      const stored: AdapterUser = { ...user, id };
      await setJson(P.user(id), stored, USER_TTL_SECONDS);
      if (stored.email) {
        await kv().set(P.userByEmail(stored.email), id, {
          ex: USER_TTL_SECONDS,
        });
      }
      return deserializeUser(stored) as AdapterUser;
    },

    async getUser(id) {
      const u = await getJson<AdapterUser>(P.user(id));
      return deserializeUser(u);
    },

    async getUserByEmail(email) {
      const id = await kv().get(P.userByEmail(email.toLowerCase()));
      if (typeof id !== "string") return null;
      const u = await getJson<AdapterUser>(P.user(id));
      return deserializeUser(u);
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const acc = await getJson<AdapterAccount>(
        P.accountByProvider(provider, providerAccountId),
      );
      if (!acc) return null;
      const u = await getJson<AdapterUser>(P.user(acc.userId));
      return deserializeUser(u);
    },

    async updateUser(user) {
      const existing = await getJson<AdapterUser>(P.user(user.id));
      const merged: AdapterUser = { ...(existing ?? {}), ...user } as AdapterUser;
      await setJson(P.user(merged.id), merged, USER_TTL_SECONDS);
      if (merged.email) {
        await kv().set(P.userByEmail(merged.email), merged.id, {
          ex: USER_TTL_SECONDS,
        });
      }
      return deserializeUser(merged) as AdapterUser;
    },

    async deleteUser(userId) {
      const u = await getJson<AdapterUser>(P.user(userId));
      if (u?.email) await kv().del(P.userByEmail(u.email));
      await kv().del(P.user(userId));
    },

    async linkAccount(account) {
      await setJson(
        P.accountByProvider(account.provider, account.providerAccountId),
        account,
      );
      // Index for cleanup.
      const list = (await getJson<string[]>(P.accountsForUser(account.userId))) ?? [];
      const key = `${account.provider}:${account.providerAccountId}`;
      if (!list.includes(key)) list.push(key);
      await setJson(P.accountsForUser(account.userId), list);
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await kv().del(P.accountByProvider(provider, providerAccountId));
    },

    async createSession(session) {
      await setJson(P.session(session.sessionToken), session);
      const list = (await getJson<string[]>(P.sessionsForUser(session.userId))) ?? [];
      list.push(session.sessionToken);
      await setJson(P.sessionsForUser(session.userId), list);
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const s = await getJson<AdapterSession>(P.session(sessionToken));
      if (!s) return null;
      const u = await getJson<AdapterUser>(P.user(s.userId));
      if (!u) return null;
      return {
        session: deserializeSession(s) as AdapterSession,
        user: deserializeUser(u) as AdapterUser,
      };
    },

    async updateSession(session) {
      const existing = await getJson<AdapterSession>(P.session(session.sessionToken));
      if (!existing) return null;
      const merged = { ...existing, ...session };
      await setJson(P.session(merged.sessionToken), merged);
      return deserializeSession(merged);
    },

    async deleteSession(sessionToken) {
      await kv().del(P.session(sessionToken));
    },

    async createVerificationToken(token) {
      const ttl = Math.max(
        60,
        Math.floor((token.expires.getTime() - Date.now()) / 1000),
      );
      await setJson(P.verificationToken(token.identifier, token.token), token, ttl);
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const v = await getJson<VerificationToken>(
        P.verificationToken(identifier, token),
      );
      if (!v) return null;
      await kv().del(P.verificationToken(identifier, token));
      return { ...v, expires: new Date(v.expires) } as VerificationToken;
    },
  };
}
