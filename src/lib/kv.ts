import { Redis } from "@upstash/redis";
import type { Scope } from "@/lib/scope";

// Upstash REST credentials are auto-provisioned by the Vercel Marketplace
// integration as KV_REST_API_URL + KV_REST_API_TOKEN. We use the REST client
// because it works at Edge runtime; the standard ioredis client does not.

let _client: Redis | null = null;

export function kv(): Redis {
  if (_client) return _client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV is not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)",
    );
  }
  _client = new Redis({ url, token });
  return _client;
}

export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const TX_TTL_DAYS = 90;
const TX_TTL_SECONDS = TX_TTL_DAYS * 24 * 60 * 60;
const CATEGORY_TTL_SECONDS = 7 * 24 * 60 * 60;

// Per-scope key shapes. We never concatenate raw scope ids into keys outside
// these helpers, so it's impossible to accidentally cross scopes.
function scopePrefix(scope: Scope): string {
  if (scope.kind === "user") return `sally:user:${scope.id}`;
  // Legacy single-user path. Kept for installs that still run with
  // AUTH_ENABLED=false. Never used in multi-user mode.
  return `sally:device:${scope.id}`;
}

const TX_KEY = (scope: Scope) => `${scopePrefix(scope)}:tx`;
const SUB_KEY = (scope: Scope) => `${scopePrefix(scope)}:push`;
const CAT_KEY = (scope: Scope, externalId: string) =>
  `${scopePrefix(scope)}:cat:${externalId}`;

export type StoredTransaction = {
  externalId: string;
  amount: number;
  category: string;
  paymentMethod: "cash" | "credit";
  installments: number;
  issuer: "cal" | "max";
  cardLast4?: string;
  merchant?: string;
  note?: string;
  occurredAt: string;
  receivedAt: number;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  registeredAt: number;
};

/**
 * Push a parsed transaction onto the scope's queue. Idempotent on
 * `externalId`: ZADD NX returns 0 for replays, which we propagate as
 * `added: false` so the caller skips downstream side-effects (push, etc.).
 */
export async function pushTransaction(
  scope: Scope,
  tx: StoredTransaction,
): Promise<{ added: boolean }> {
  const key = TX_KEY(scope);
  const added = await kv().zadd(
    key,
    { nx: true },
    { score: tx.receivedAt, member: JSON.stringify(tx) },
  );
  await kv().expire(key, TX_TTL_SECONDS);
  return { added: added === 1 };
}

/**
 * Pull all transactions for `scope` strictly newer than `since` (ms epoch).
 * Caps at 200 to keep the response small.
 */
export async function pullTransactionsSince(
  scope: Scope,
  since: number,
): Promise<StoredTransaction[]> {
  const key = TX_KEY(scope);
  const raw = (await kv().zrange(key, since + 1, "+inf", {
    byScore: true,
    offset: 0,
    count: 200,
  })) as Array<string | StoredTransaction>;

  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        try {
          return JSON.parse(entry) as StoredTransaction;
        } catch {
          return null;
        }
      }
      return entry;
    })
    .filter((v): v is StoredTransaction => v !== null);
}

export async function savePushSubscription(
  scope: Scope,
  sub: PushSubscriptionRecord,
): Promise<void> {
  await kv().set(SUB_KEY(scope), sub);
  await kv().expire(SUB_KEY(scope), TX_TTL_SECONDS);
}

export async function getPushSubscription(
  scope: Scope,
): Promise<PushSubscriptionRecord | null> {
  const raw = await kv().get(SUB_KEY(scope));
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as PushSubscriptionRecord;
    } catch {
      return null;
    }
  }
  return raw as PushSubscriptionRecord;
}

export async function deletePushSubscription(scope: Scope): Promise<void> {
  await kv().del(SUB_KEY(scope));
}

export async function recordCategoryOverride(
  scope: Scope,
  externalId: string,
  category: string,
): Promise<void> {
  await kv().set(CAT_KEY(scope, externalId), category, {
    ex: CATEGORY_TTL_SECONDS,
  });
}

export async function readCategoryOverride(
  scope: Scope,
  externalId: string,
): Promise<string | null> {
  const v = await kv().get(CAT_KEY(scope, externalId));
  return typeof v === "string" ? v : null;
}
