import { Redis } from "@upstash/redis";
import type { Scope } from "@/lib/scope";
import type { Issuer } from "@/types/finance";
import type { NativePushToken } from "@/lib/native/push-token";

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
const PUSH_LAST_KEY = (scope: Scope) => `${scopePrefix(scope)}:push:last`;
const PUSH_CLICK_KEY = (scope: Scope) => `${scopePrefix(scope)}:push:click`;
const SNAPSHOTS_KEY = (scope: Scope) => `${scopePrefix(scope)}:state:snapshots`;
const STATE_KEY = (scope: Scope) => `${scopePrefix(scope)}:state`;
const BACKUP_LOG_KEY = (scope: Scope) =>
  `${scopePrefix(scope)}:state:backuplog`;
const BACKUP_LOG_KEEP = 50;
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
   *  we don't always know which card was tapped. Widened in Phase 90 to
   *  cover the full Issuer enum so non-CAL/MAX SMS sources fit too. */
  issuer: Issuer | "wallet";
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
 * Scan KV for every `sally:device:<id>:state` key. Returns the list of
 * device ids. Used by the recovery flow to surface orphan blobs the user
 * may have lost when their deviceId changed (PWA reinstall, /reset,
 * Safari "clear website data").
 *
 * SCAN is cooperative — Upstash returns at most ~10k keys per call. For
 * a single-tenant app this is more than enough; if it ever isn't, the
 * caller can paginate via the returned cursor.
 */
export async function listDeviceStateKeys(): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | number = 0;
  for (let i = 0; i < 20; i++) {
    const res = (await kv().scan(cursor, {
      match: "sally:device:*:state",
      count: 500,
    })) as [string, string[]];
    const [next, batch] = res;
    for (const k of batch) out.push(k);
    if (String(next) === "0") break;
    cursor = next;
  }
  return out;
}

/** Extract the deviceId portion of a `sally:device:<id>:state` key. */
export function deviceIdFromStateKey(key: string): string | null {
  const m = key.match(/^sally:device:(.+):state$/);
  return m ? m[1] : null;
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
 * Remove every ZSET member with the given externalId AND drop the
 * SET-NX seen flag, so a fresh `pushTransaction` with the same id can
 * replace it. Used by the test-push endpoint to keep a single "🧪
 * בדיקה" row instead of accumulating one per click.
 */
export async function removeTransaction(
  scope: Scope,
  externalId: string,
): Promise<{ removed: number }> {
  const key = TX_KEY(scope);
  const raw = (await kv().zrange(key, 0, 999, {
    rev: true,
  })) as Array<string | StoredTransaction>;
  let removed = 0;
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
    if (!tx || tx.externalId !== externalId) continue;
    const member = typeof entry === "string" ? entry : JSON.stringify(entry);
    await kv().zrem(key, member);
    removed++;
  }
  await kv().del(TX_SEEN_KEY(scope, externalId));
  return { removed };
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

export type StateSnapshot = {
  /** Reason the snapshot was taken — surfaced in the recovery UI. */
  reason:
    | "pre-claim-device"
    | "pre-recover-device"
    | "pre-restore"
    | "manual"
    | "auto";
  capturedAt: number;
  blob: StateBlob;
};

// Per-reason retention budget. Manual backups are pinned highest so
// a user's explicit save survives bursts of automatic snapshots.
const SNAPSHOT_RETENTION: Record<StateSnapshot["reason"], number> = {
  manual: 10,
  "pre-restore": 5,
  "pre-claim-device": 5,
  "pre-recover-device": 5,
  auto: 20,
};
const SNAPSHOT_HARD_CAP = 50;

/**
 * Capture the CURRENT user/device state as a rollback snapshot before
 * any destructive write. Uses per-reason retention budgets so manual
 * backups never get evicted by a burst of automatic ones. No-op when
 * the current state is empty — empty snapshots have no recovery value.
 */
export async function captureStateSnapshot(
  scope: Scope,
  reason: StateSnapshot["reason"],
): Promise<{ captured: boolean; capturedAt: number | null }> {
  const blob = await getUserState(scope);
  if (!blob) return { captured: false, capturedAt: null };
  const entry: StateSnapshot = {
    reason,
    capturedAt: Date.now(),
    blob,
  };
  const key = SNAPSHOTS_KEY(scope);
  await kv().zadd(key, {
    score: entry.capturedAt,
    member: JSON.stringify(entry),
  });
  await trimSnapshotsByReason(scope);
  await kv().expire(key, STATE_TTL_SECONDS);
  return { captured: true, capturedAt: entry.capturedAt };
}

async function trimSnapshotsByReason(scope: Scope): Promise<void> {
  const key = SNAPSHOTS_KEY(scope);
  const raw = (await kv().zrange(key, 0, -1, { rev: true })) as Array<
    string | StateSnapshot
  >;
  const parsed: Array<{ s: StateSnapshot; raw: string }> = [];
  for (const v of raw) {
    if (typeof v === "string") {
      try {
        parsed.push({ s: JSON.parse(v) as StateSnapshot, raw: v });
      } catch {
        /* ignore corrupted entry */
      }
    } else {
      parsed.push({ s: v as StateSnapshot, raw: JSON.stringify(v) });
    }
  }
  const buckets = new Map<StateSnapshot["reason"], typeof parsed>();
  for (const item of parsed) {
    const list = buckets.get(item.s.reason) ?? [];
    list.push(item);
    buckets.set(item.s.reason, list);
  }
  const evictions = new Set<string>();
  for (const [reason, list] of buckets) {
    const cap = SNAPSHOT_RETENTION[reason] ?? 5;
    if (list.length <= cap) continue;
    list.sort((a, b) => b.s.capturedAt - a.s.capturedAt);
    for (const item of list.slice(cap)) evictions.add(item.raw);
  }
  if (parsed.length > SNAPSHOT_HARD_CAP) {
    parsed.sort((a, b) => b.s.capturedAt - a.s.capturedAt);
    for (const item of parsed.slice(SNAPSHOT_HARD_CAP)) {
      evictions.add(item.raw);
    }
  }
  if (evictions.size > 0) {
    await kv().zrem(key, ...Array.from(evictions));
  }
}

/** List captured snapshots, newest first. */
export async function listStateSnapshots(
  scope: Scope,
): Promise<StateSnapshot[]> {
  const key = SNAPSHOTS_KEY(scope);
  const raw = (await kv().zrange(key, 0, -1, {
    rev: true,
  })) as Array<string | StateSnapshot>;
  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        try {
          return JSON.parse(entry) as StateSnapshot;
        } catch {
          return null;
        }
      }
      return entry;
    })
    .filter((v): v is StateSnapshot => v !== null);
}

/** Save a snapshot's blob back into the live state slot. Used by the
 *  rollback / undo-restore flow. */
export async function restoreFromSnapshot(
  scope: Scope,
  capturedAt: number,
): Promise<{ restored: boolean }> {
  const snapshots = await listStateSnapshots(scope);
  const target = snapshots.find((s) => s.capturedAt === capturedAt);
  if (!target) return { restored: false };
  await saveUserState(scope, {
    version: target.blob.version,
    updatedAt: Date.now(),
    state: target.blob.state,
  });
  return { restored: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Backup audit log — every manual / auto / restore event lands here so the
// user can prove that a backup actually happened. Capped at BACKUP_LOG_KEEP
// to avoid unbounded growth. Stored as a sorted set scored by ts, newest
// first on read.
// ────────────────────────────────────────────────────────────────────────────

export type BackupLogEvent = {
  ts: number;
  kind:
    | "backup-manual"
    | "backup-auto"
    | "backup-pre-restore"
    | "restore"
    | "restore-blocked-empty";
  capturedAt?: number;
  counts?: {
    entries: number;
    accounts: number;
    loans: number;
    rules: number;
    incomes: number;
    statuses: number;
    monthlyBudget: number;
    richness: number;
  };
  ok: boolean;
  note?: string;
};

export async function appendBackupLog(
  scope: Scope,
  event: BackupLogEvent,
): Promise<void> {
  const key = BACKUP_LOG_KEY(scope);
  await kv().zadd(key, {
    score: event.ts,
    member: JSON.stringify(event),
  });
  await kv().zremrangebyrank(key, 0, -BACKUP_LOG_KEEP - 1);
  await kv().expire(key, STATE_TTL_SECONDS);
}

export async function listBackupLog(
  scope: Scope,
): Promise<BackupLogEvent[]> {
  const key = BACKUP_LOG_KEY(scope);
  const raw = (await kv().zrange(key, 0, -1, {
    rev: true,
  })) as Array<string | BackupLogEvent>;
  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        try {
          return JSON.parse(entry) as BackupLogEvent;
        } catch {
          return null;
        }
      }
      return entry;
    })
    .filter((v): v is BackupLogEvent => v !== null);
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

// ── Native push tokens (Phase 203) ────────────────────────────────────
// One record per (scope, platform). Stored alongside the Web Push
// subscription so the future fan-out (push-native-server.ts) can prefer
// native delivery and fall back to Web Push transparently.

const NATIVE_TOKEN_KEY = (scope: Scope, platform: "ios" | "android") =>
  `${scopePrefix(scope)}:push-native:${platform}`;

export async function saveNativePushToken(
  scope: Scope,
  token: NativePushToken,
): Promise<void> {
  const key = NATIVE_TOKEN_KEY(scope, token.platform);
  await kv().set(key, token);
  await kv().expire(key, TX_TTL_SECONDS);
}

export async function getNativePushToken(
  scope: Scope,
  platform: "ios" | "android",
): Promise<NativePushToken | null> {
  const raw = await kv().get(NATIVE_TOKEN_KEY(scope, platform));
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as NativePushToken;
    } catch {
      return null;
    }
  }
  return raw as NativePushToken;
}

export async function deleteNativePushToken(
  scope: Scope,
  platform: "ios" | "android",
): Promise<void> {
  await kv().del(NATIVE_TOKEN_KEY(scope, platform));
}

export async function listNativePushTokens(
  scope: Scope,
): Promise<NativePushToken[]> {
  const out: NativePushToken[] = [];
  for (const platform of ["ios", "android"] as const) {
    const t = await getNativePushToken(scope, platform);
    if (t) out.push(t);
  }
  return out;
}

// ── Phase 217 — Liquidity status snapshot ────────────────────────────
// Client posts this once per local-day. Cron reads it the next morning
// to decide whether to fire a proactive push without re-deriving the
// user's full liquidity curve on the server (which would require either
// a service role or the user's full state in KV — neither exists).
//
// 26-hour TTL so a stale day's snapshot decays naturally if the user
// stops opening the app.

export type LiquidityStatusSnapshot = {
  willCrossZero: boolean;
  lowestProjectedBalance: number;
  daysUntilDip: number;
  updatedAt: number;
};

const LIQUIDITY_STATUS_KEY = (scope: Scope) =>
  `${scopePrefix(scope)}:liquidity-status`;
const LIQUIDITY_STATUS_TTL_SECONDS = 26 * 60 * 60;

export async function saveLiquidityStatus(
  scope: Scope,
  snap: LiquidityStatusSnapshot,
): Promise<void> {
  const key = LIQUIDITY_STATUS_KEY(scope);
  await kv().set(key, snap);
  await kv().expire(key, LIQUIDITY_STATUS_TTL_SECONDS);
}

export async function getLiquidityStatus(
  scope: Scope,
): Promise<LiquidityStatusSnapshot | null> {
  const raw = await kv().get(LIQUIDITY_STATUS_KEY(scope));
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as LiquidityStatusSnapshot;
    } catch {
      return null;
    }
  }
  return raw as LiquidityStatusSnapshot;
}

/** Walk every push subscription key. Lets the cron fan out without
 *  needing per-user secrets — RLS doesn't apply because KV is not
 *  Supabase and every saved sub is scoped to a deterministic prefix
 *  we control. */
export async function listPushSubscriptionKeys(): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | number = 0;
  for (let i = 0; i < 40; i++) {
    const res = (await kv().scan(cursor, {
      match: "sally:*:push",
      count: 500,
    })) as [string, string[]];
    const [next, batch] = res;
    for (const k of batch) out.push(k);
    if (String(next) === "0") break;
    cursor = next;
  }
  return out;
}

/** Reverse of the SUB_KEY shape. Returns a Scope when the key is
 *  recognised, null otherwise (e.g. malformed keys, future shapes). */
export function scopeFromPushSubKey(key: string): Scope | null {
  const device = key.match(/^sally:device:(.+):push$/);
  if (device) return { kind: "device", id: device[1] };
  const user = key.match(/^sally:user:(.+):push$/);
  if (user) return { kind: "user", id: user[1] };
  return null;
}

export type PushAttempt = {
  ts: number;
  ok: boolean;
  gone: boolean;
  status?: number;
  reason?: string;
  endpointHost?: string;
  externalId?: string;
};

export async function recordPushAttempt(
  scope: Scope,
  attempt: PushAttempt,
): Promise<void> {
  const key = PUSH_LAST_KEY(scope);
  await kv().set(key, JSON.stringify(attempt));
  await kv().expire(key, TX_TTL_SECONDS);
}

export async function readPushAttempt(
  scope: Scope,
): Promise<PushAttempt | null> {
  const raw = await kv().get(PUSH_LAST_KEY(scope));
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as PushAttempt;
    } catch {
      return null;
    }
  }
  return raw as PushAttempt;
}

export type PushClick = {
  externalId: string;
  ts: number;
};

/** Record a notification-tap target so the PWA can recover the
 *  deep-link on next mount when the SW's openWindow/navigate calls
 *  fail (iOS standalone PWA). 5-minute TTL — long enough for the user
 *  to come back, short enough not to re-open stale targets. */
export async function recordPushClick(
  scope: Scope,
  click: PushClick,
): Promise<void> {
  const key = PUSH_CLICK_KEY(scope);
  await kv().set(key, JSON.stringify(click), { ex: 300 });
}

/** Atomically read + clear the most recent push click. */
export async function consumePushClick(
  scope: Scope,
): Promise<PushClick | null> {
  const key = PUSH_CLICK_KEY(scope);
  const raw = await kv().get(key);
  if (!raw) return null;
  await kv().del(key);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as PushClick;
    } catch {
      return null;
    }
  }
  return raw as PushClick;
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
