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
const TX_SEEN_KEY = (scope: Scope, externalId: string) =>
  `${scopePrefix(scope)}:tx:seen:${externalId}`;
const SUB_KEY = (scope: Scope) => `${scopePrefix(scope)}:push`;
const STATE_KEY = (scope: Scope) => `${scopePrefix(scope)}:state`;
// Long TTL so a user who reinstalls the PWA after 90 days still gets their
// state back. Touched on every write — effectively permanent for active users.
const STATE_TTL_SECONDS = 365 * 24 * 60 * 60;
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
 * `externalId`.
 *
 * Earlier implementations relied on `ZADD NX` keyed by the serialized member,
 * but every call assigns `receivedAt = Date.now()` so a replay produced a
 * *different* member and ZADD-NX let it through twice. We now use a
 * dedicated `SET NX EX` flag per externalId as the actual guard, then ZADD
 * (without NX) once we know it's the first arrival. Worst case on a race,
 * a single replay wins the SET and the other no-ops — never duplicated.
 */
export async function pushTransaction(
  scope: Scope,
  tx: StoredTransaction,
): Promise<{ added: boolean }> {
  const seenKey = TX_SEEN_KEY(scope, tx.externalId);
  const wasFirst = await kv().set(seenKey, "1", {
    nx: true,
    ex: TX_TTL_SECONDS,
  });
  if (wasFirst !== "OK") return { added: false };
  const key = TX_KEY(scope);
  await kv().zadd(
    key,
    { score: tx.receivedAt, member: JSON.stringify(tx) },
  );
  await kv().expire(key, TX_TTL_SECONDS);
  return { added: true };
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

/**
 * One-shot migration helper: copy every transaction in the source scope's
 * ZSET into the target scope, then delete the source. Used by claim-device
 * when a device that's been ingesting webhooks gets bound to a freshly
 * signed-in user — without this the pending wallet/SMS rows sit forever
 * under the device prefix while the dashboard reads from the user prefix.
 *
 * Idempotent on member content because pushTransaction uses a SET-NX dedup
 * guard keyed by externalId.
 */
export async function migrateTransactions(
  from: Scope,
  to: Scope,
): Promise<{ moved: number }> {
  const fromKey = TX_KEY(from);
  const raw = (await kv().zrange(fromKey, 0, 999, {
    rev: true,
  })) as Array<string | StoredTransaction>;
  let moved = 0;
  for (const entry of raw) {
    const tx =
      typeof entry === "string"
        ? (() => {
            try {
              return JSON.parse(entry) as StoredTransaction;
            } catch {
              return null;
            }
          })()
        : (entry as StoredTransaction);
    if (!tx) continue;
    const r = await pushTransaction(to, tx);
    if (r.added) moved++;
  }
  if (moved > 0) {
    // Source ZSET still sits around as a backup. Let it expire naturally
    // via its existing TX_TTL_SECONDS rather than deleting — recovery
    // route can still walk it if needed.
  }
  return { moved };
}

/**
 * Look up a single transaction by externalId. Scans the recent ZSET in
 * descending order — fine for the post-push deep-link use case where the
 * row is typically minutes old, and we cap at 200 candidates anyway.
 */
export async function findTransactionByExternalId(
  scope: Scope,
  externalId: string,
): Promise<StoredTransaction | null> {
  const key = TX_KEY(scope);
  const raw = (await kv().zrange(key, 0, 199, {
    rev: true,
  })) as Array<string | StoredTransaction>;
  for (const entry of raw) {
    const tx =
      typeof entry === "string"
        ? (() => {
            try {
              return JSON.parse(entry) as StoredTransaction;
            } catch {
              return null;
            }
          })()
        : (entry as StoredTransaction);
    if (tx && tx.externalId === externalId) return tx;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-scope state blob.
//
// Persists the full Zustand store (accounts, loans, incomes, rules,
// statuses, entries, monthlyBudget, etc.) in KV under a single JSON blob
// keyed by scope. This lets a user's financial setup follow them across
// devices, browsers, PWA reinstalls, and Vercel deploys — no relational
// schema yet, but a real durable backing store instead of localStorage.
// ────────────────────────────────────────────────────────────────────────────

export type StateBlob = {
  /** Schema version of the persisted Zustand store. */
  version: number;
  /** Server epoch ms when the blob was last written. Used by the client
   *  to decide between local vs. remote "last writer wins". */
  updatedAt: number;
  /** Opaque JSON-serialisable payload — the Zustand store snapshot. */
  state: unknown;
};

export async function getUserState(scope: Scope): Promise<StateBlob | null> {
  const raw = await kv().get(STATE_KEY(scope));
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StateBlob;
    } catch {
      return null;
    }
  }
  return raw as StateBlob;
}

export async function saveUserState(
  scope: Scope,
  blob: StateBlob,
): Promise<void> {
  // SET with explicit TTL so the blob lives a year from the latest write.
  await kv().set(STATE_KEY(scope), JSON.stringify(blob), {
    ex: STATE_TTL_SECONDS,
  });
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
