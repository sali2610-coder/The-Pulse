// Server-side Web Push utility (Node runtime).
//
// We use the `web-push` library (Node-only — depends on `node:crypto`) on the
// webhook route, which already runs at the Node runtime when push is enabled.
// VAPID keys come from env (generate with `npx web-push generate-vapid-keys`).

import webpush, { type PushSubscription } from "web-push";

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type CategorizePushPayload = {
  kind: "categorize";
  externalId: string;
  /** The SW echoes this back in the categorize fetch header. */
  deviceId: string;
  amount: number;
  merchant?: string;
  cardLast4?: string;
  /** Heuristic from `categorize(merchant)` — surfaces in the SW so the quick
   *  "אישור" action can apply it without making the user choose. Omitted
   *  when the parser fell back to "other". */
  categoryHint?: string;
  /** When set + > 1, the body adds a "{installments}× תשלומים" hint. */
  installments?: number;
  /** ISO timestamp the underlying SMS / wallet event arrived. The SW formats
   *  this as a short HH:mm fragment in the body. */
  occurredAt?: string;
};

export type PushSendResult = {
  ok: boolean;
  gone: boolean;
  /** Underlying HTTP status from the push service (web.push.apple.com,
   *  fcm.googleapis.com, etc.) when available. */
  status?: number;
  /** Short error tag the route can echo back to the client for diagnosis. */
  reason?: string;
  /** Endpoint host (no path) the push was attempted against. Helps the
   *  client tell whether the server is firing to apple/fcm/mozilla. */
  endpointHost?: string;
};

function endpointHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
}

export async function sendCategorizePush(
  sub: StoredSubscription,
  payload: CategorizePushPayload,
): Promise<PushSendResult> {
  const host = endpointHost(sub.endpoint);
  if (!ensureConfigured()) {
    return { ok: false, gone: false, reason: "vapid_unconfigured", endpointHost: host };
  }
  try {
    const res = await webpush.sendNotification(
      sub as unknown as PushSubscription,
      JSON.stringify(payload),
      // 5 min — covers a brief offline phone without keeping stale charges
      // queued forever on the FCM/APNS bridge.
      { TTL: 300 },
    );
    const status = (res as { statusCode?: number }).statusCode;
    console.info(
      `[push] sent categorize externalId=${payload.externalId} host=${host} status=${status}`,
    );
    return { ok: true, gone: false, status, endpointHost: host };
  } catch (err) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    const status = e.statusCode;
    const reason =
      status === 404 || status === 410
        ? "subscription_gone"
        : status === 403
          ? "vapid_mismatch"
          : status === 413
            ? "payload_too_large"
            : status === 429
              ? "rate_limited"
              : status
                ? `push_${status}`
                : "push_error";
    console.error(
      `[push] failed categorize externalId=${payload.externalId} host=${host} status=${status} reason=${reason} body=${e.body ?? e.message ?? ""}`,
    );
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, status, reason, endpointHost: host };
    }
    return { ok: false, gone: false, status, reason, endpointHost: host };
  }
}

/** Non-transaction push payloads — overdraft warnings, income credits,
 *  loan-payment reminders, forecast alerts. The service worker formats
 *  these with their own emoji + tone instead of the categorize chrome. */
export type AlertPushPayload = {
  kind: "alert";
  /** Stable id so multiple identical alerts collapse to one notification. */
  id: string;
  severity: "info" | "positive" | "warning" | "danger";
  title: string;
  body: string;
  /** Optional deep-link target path within the PWA. Defaults to "/". */
  href?: string;
};

export async function sendAlertPush(
  sub: StoredSubscription,
  payload: AlertPushPayload,
): Promise<PushSendResult> {
  const host = endpointHost(sub.endpoint);
  if (!ensureConfigured()) {
    return { ok: false, gone: false, reason: "vapid_unconfigured", endpointHost: host };
  }
  try {
    const res = await webpush.sendNotification(
      sub as unknown as PushSubscription,
      JSON.stringify(payload),
      // Alerts are informational — they live longer than a categorize push
      // because the user may not have their phone in hand at the moment.
      { TTL: 3600 },
    );
    const status = (res as { statusCode?: number }).statusCode;
    return { ok: true, gone: false, status, endpointHost: host };
  } catch (err) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    const status = e.statusCode;
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, status, reason: "subscription_gone", endpointHost: host };
    }
    return { ok: false, gone: false, status, reason: status ? `push_${status}` : "push_error", endpointHost: host };
  }
}
