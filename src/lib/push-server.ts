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

export async function sendCategorizePush(
  sub: StoredSubscription,
  payload: CategorizePushPayload,
): Promise<{ ok: boolean; gone: boolean }> {
  if (!ensureConfigured()) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(
      sub as unknown as PushSubscription,
      JSON.stringify(payload),
      // 5 min — covers a brief offline phone without keeping stale charges
      // queued forever on the FCM/APNS bridge.
      { TTL: 300 },
    );
    return { ok: true, gone: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 / 410 = subscription gone; caller should drop it from storage.
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, gone: false };
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
): Promise<{ ok: boolean; gone: boolean }> {
  if (!ensureConfigured()) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(
      sub as unknown as PushSubscription,
      JSON.stringify(payload),
      // Alerts are informational — they live longer than a categorize push
      // because the user may not have their phone in hand at the moment.
      { TTL: 3600 },
    );
    return { ok: true, gone: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, gone: false };
  }
}
