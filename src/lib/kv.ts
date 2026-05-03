import { Redis } from "@upstash/redis";

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

const TX_KEY = (deviceId: string) => `sally:tx:${deviceId}`;
const TX_TTL_DAYS = 90;
const TX_TTL_SECONDS = TX_TTL_DAYS * 24 * 60 * 60;

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
  receivedAt: number; // ms epoch — used as the sorted-set score for `since`.
};

/**
 * Push a parsed transaction onto the device's queue. Idempotent on
 * `externalId`: ZADD with the same member updates score, but the value (JSON)
 * stays the same, so we treat replays as no-ops.
 */
export async function pushTransaction(
  deviceId: string,
  tx: StoredTransaction,
): Promise<{ added: boolean }> {
  const key = TX_KEY(deviceId);
  // ZADD NX returns count of newly-added members (0 if duplicate).
  const added = await kv().zadd(
    key,
    { nx: true },
    { score: tx.receivedAt, member: JSON.stringify(tx) },
  );
  // Refresh the TTL so an active device's queue keeps living.
  await kv().expire(key, TX_TTL_SECONDS);
  return { added: added === 1 };
}

/**
 * Pull all transactions for `deviceId` strictly newer than `since` (ms epoch).
 * Returns up to 200 to keep the response small.
 */
export async function pullTransactionsSince(
  deviceId: string,
  since: number,
): Promise<StoredTransaction[]> {
  const key = TX_KEY(deviceId);
  // Upstash REST: zrange with byScore. `since` is exclusive via offset of +1.
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
