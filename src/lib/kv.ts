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
const WH_LOG_KEY = (scope: Scope) => `${scopePrefix(scope)}:wh`;
const WH_ANON_LOG_KEY = "sally:wh:anon";
const WH_LOG_KEEP = 20;
const WH_ANON_KEEP = 10;
const WH_LOG_TTL_SECONDS = 14 * 24 * 60 * 60;

export type StoredTransaction = {
  externalId: string;
  amount: number;
  category: string;
  paymentMethod: "cash" | "credit";
  installments: number;
  /** Card issuer for SMS rows; `"wallet"` for Wallet notifications where
   *  we don't always know which card was tapped. */
  issuer: "cal" | "max" | "wallet";
  /** Channel the row arrived on. New writes always set this; older rows
   *  may be undefined and should be treated as `"sms"`. */
  source?: "sms" | "wallet";
  cardLast4?: string;
  merchant?: string;
  note?: string;
  occurredAt: string;
  receivedAt: number;
  /** Bank hasn't finalized the charge yet ("תלוי ועומד" in CAL/MAX). */
  bankPending?: boolean;
  /** Arrived via Wallet with partial data; user must review before the
   *  entry counts toward forecast/upcoming. */
  needsConfirmation?: boolean;
  /** Original notification body — kept so the confirmation sheet can
   *  re-parse if needed. Only present for `source === "wallet"`. */
  rawNotificationBody?: string;
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

// ────────────────────────────────────────────────────────────────────────────
// Webhook diagnostic log.
// ────────────────────────────────────────────────────────────────────────────
//
// Two ring buffers:
//
//   sally:user:<userId>:wh   — last 20 webhook calls authenticated as that
//                              user, stored as JSON values in a sorted set
//                              scored by epoch ms.
//   sally:wh:anon            — last 10 calls that failed authentication
//                              (no token resolved), so the user can see
//                              "an unauth attempt happened ~5s ago".
//
// Both rings are trimmed on every write via ZREMRANGEBYRANK to a fixed cap.

export type WebhookLogEntry = {
  ts: number;
  ok: boolean;
  status: number;
  reason: string;
  externalId?: string;
  pushed?: string;
  merchant?: string;
};

async function logRingPush(
  key: string,
  keep: number,
  entry: WebhookLogEntry,
): Promise<void> {
  const member = JSON.stringify({ ...entry });
  await kv().zadd(key, { score: entry.ts, member });
  // Trim to last `keep` entries (highest scores survive). Negative indexes
  // count from the high end. ZREMRANGEBYRANK with [0, -keep-1] removes
  // everything below the most recent `keep`.
  await kv().zremrangebyrank(key, 0, -keep - 1);
  await kv().expire(key, WH_LOG_TTL_SECONDS);
}

export async function appendUserWebhookLog(
  scope: Scope,
  entry: WebhookLogEntry,
): Promise<void> {
  await logRingPush(WH_LOG_KEY(scope), WH_LOG_KEEP, entry);
}

export async function appendAnonWebhookLog(
  entry: WebhookLogEntry,
): Promise<void> {
  await logRingPush(WH_ANON_LOG_KEY, WH_ANON_KEEP, entry);
}

async function readRing(key: string, count: number): Promise<WebhookLogEntry[]> {
  const raw = (await kv().zrange(key, 0, count - 1, {
    rev: true,
  })) as Array<string | WebhookLogEntry>;
  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        try {
          return JSON.parse(entry) as WebhookLogEntry;
        } catch {
          return null;
        }
      }
      return entry;
    })
    .filter((v): v is WebhookLogEntry => v !== null);
}

export async function readUserWebhookLog(
  scope: Scope,
): Promise<WebhookLogEntry[]> {
  return readRing(WH_LOG_KEY(scope), WH_LOG_KEEP);
}

export async function readAnonWebhookLog(): Promise<WebhookLogEntry[]> {
  return readRing(WH_ANON_LOG_KEY, WH_ANON_KEEP);
}
