import { z } from "zod";
import { parseSmsByIssuer } from "@/lib/parsers";
import { parseWalletNotification } from "@/lib/parsers/wallet";
import { externalIdFor } from "@/lib/parsers/helpers";
import { sanitizeMerchant } from "@/lib/sanitize";
import { categorize } from "@/lib/parsers";
import {
  pushTransaction,
  isKvConfigured,
  getPushSubscription,
  deletePushSubscription,
  appendUserWebhookLog,
  appendAnonWebhookLog,
  type StoredTransaction,
  type WebhookLogEntry,
} from "@/lib/kv";
import { isPushConfigured, sendCategorizePush } from "@/lib/push-server";
import { resolveTokenToUserId } from "@/lib/api-token";
import { AUTH_ENABLED } from "@/lib/auth-config";
import type { Scope } from "@/lib/scope";

// Node runtime so we can use the web-push library (depends on `node:crypto`).
// Sync + push subscribe stay at the Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_DEVICE_ID_LEN = 128;

const smsBodySchema = z.object({
  issuer: z.enum(["cal", "max"]),
  smsBody: z.string().min(20).max(2_000),
});

const walletBodySchema = z.object({
  issuer: z.literal("wallet"),
  notification: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2_000),
    receivedAt: z.number().int().positive().optional(),
  }),
});

const payloadSchema = z.discriminatedUnion("issuer", [
  smsBodySchema,
  walletBodySchema,
]);

/** Echoed back on schema_violation so the client knows the exact contract. */
const SCHEMA_HELP = {
  sms: {
    issuer: 'string, exactly "cal" or "max"',
    smsBody: "string, 20-2000 chars (the raw SMS body from the bank)",
    example: {
      issuer: "cal",
      smsBody:
        "לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק 'שופרסל' בסכום 150.50 ש\"ח בתאריך 06/05/26.",
    },
  },
  wallet: {
    issuer: 'string, exactly "wallet"',
    notification: {
      title: "string, 1-200 chars (notification title, e.g. \"Apple Pay\")",
      body: "string, 1-2000 chars (notification body — merchant + amount)",
      receivedAt: "optional number, unix epoch ms",
    },
    example: {
      issuer: "wallet",
      notification: {
        title: "Apple Pay",
        body: "Shufersal · ₪42.90",
        receivedAt: 1715000000000,
      },
    },
  },
} as const;

function fail(status: number, code: string, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: code, ...(extra ?? {}) }, { status });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type ResolvedScope = { scope: Scope } | { errorResponse: Response };

async function resolveScope(req: Request): Promise<ResolvedScope> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  // Multi-user mode (off by default) — Bearer required.
  if (AUTH_ENABLED) {
    if (!bearer.startsWith("stk_")) {
      return { errorResponse: fail(401, "missing_personal_token") };
    }
    const userId = await resolveTokenToUserId(bearer);
    if (!userId) return { errorResponse: fail(401, "invalid_token") };
    return { scope: { kind: "user", id: userId } };
  }

  // Single-user mode — Bearer no longer required. The iOS Shortcut sets
  // `x-sally-device: <deviceId>` and that alone identifies the install.
  // When the operator HAS set `WEBHOOK_SECRET` we still accept Bearer
  // matches as a stronger optional gate, but a missing/empty Bearer no
  // longer rejects the request as long as a valid device id is supplied.
  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !/^[A-Za-z0-9_\-:.]+$/.test(deviceId)
  ) {
    return { errorResponse: fail(400, "invalid_device") };
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && bearer && !timingSafeEqual(bearer, secret)) {
    // Operator provided a secret AND the request sent a Bearer header that
    // doesn't match — reject. Sending no Bearer at all is allowed.
    return { errorResponse: fail(401, "invalid_token") };
  }
  return { scope: { kind: "device", id: deviceId } };
}

/**
 * Best-effort log writer. We never let logging failures abort the request
 * — diagnostics matter, but not more than the actual webhook.
 */
async function safeLog(target: () => Promise<void>): Promise<void> {
  try {
    await target();
  } catch {
    /* swallow — KV may be unconfigured or temporarily unavailable */
  }
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();

  const resolved = await resolveScope(req);
  if ("errorResponse" in resolved) {
    // Auth failed before we knew which user this was. Log to the anon ring
    // so the operator can see "an unauth'd attempt happened recently".
    if (isKvConfigured()) {
      const status = resolved.errorResponse.status;
      const reason = await readErrorReason(resolved.errorResponse);
      await safeLog(() =>
        appendAnonWebhookLog({
          ts: startedAt,
          ok: false,
          status,
          reason,
        }),
      );
    }
    return resolved.errorResponse;
  }
  const scope = resolved.scope;

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    await safeLog(() =>
      appendUserWebhookLog(scope, {
        ts: startedAt,
        ok: false,
        status: 413,
        reason: "payload_too_large",
      }),
    );
    return fail(413, "payload_too_large");
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    await safeLog(() =>
      appendUserWebhookLog(scope, {
        ts: startedAt,
        ok: false,
        status: 400,
        reason: "unreadable_body",
      }),
    );
    return fail(400, "unreadable_body");
  }
  if (raw.length > MAX_BODY_BYTES) {
    await safeLog(() =>
      appendUserWebhookLog(scope, {
        ts: startedAt,
        ok: false,
        status: 413,
        reason: "payload_too_large",
      }),
    );
    return fail(413, "payload_too_large");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    await safeLog(() =>
      appendUserWebhookLog(scope, {
        ts: startedAt,
        ok: false,
        status: 400,
        reason: "invalid_json",
      }),
    );
    return fail(400, "invalid_json");
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    // Surface the exact field + constraint that failed so the iOS Shortcut
    // author can fix their POST body without guessing. Common cases:
    //   - sent `message` instead of `smsBody` → "Required"
    //   - sent the SMS text raw (not JSON-stringified) → invalid_json earlier
    //   - sent a 5-char preview → "String must contain at least 20 character(s)"
    const issues = parsed.error.issues.map((i) => ({
      field: i.path.join(".") || "(root)",
      message: i.message,
      code: i.code,
    }));
    await safeLog(() =>
      appendUserWebhookLog(scope, {
        ts: startedAt,
        ok: false,
        status: 422,
        reason: "schema_violation",
      }),
    );
    return fail(422, "schema_violation", { issues, expected: SCHEMA_HELP });
  }

  let tx: StoredTransaction;
  let externalId: string;

  if (parsed.data.issuer === "wallet") {
    // Wallet branch — partial data is OK; we persist with needsConfirmation
    // so the user can review later from the in-app pending tray.
    const { notification } = parsed.data;
    const wallet = parseWalletNotification(notification);
    if (!wallet.ok) {
      await safeLog(() =>
        appendUserWebhookLog(scope, {
          ts: startedAt,
          ok: false,
          status: 422,
          reason: wallet.reason,
        }),
      );
      return fail(422, wallet.reason, { missing: wallet.missing });
    }
    if (!isKvConfigured()) {
      return Response.json({
        ok: true,
        persisted: false,
        reason: "kv_not_configured",
        parsed: wallet.result,
      });
    }

    const idSource = `wallet|${notification.body}|${notification.receivedAt ?? ""}`;
    externalId = await externalIdFor(scope.id, idSource);
    const merchantClean = wallet.result.merchant
      ? sanitizeMerchant(wallet.result.merchant)
      : undefined;
    tx = {
      externalId,
      amount: wallet.result.amount,
      category: categorize(merchantClean ?? wallet.result.merchant ?? ""),
      paymentMethod: "credit",
      installments: 1,
      issuer: "wallet",
      source: "wallet",
      cardLast4: wallet.result.cardLast4,
      merchant: merchantClean,
      note: wallet.result.applePay ? "Apple Pay" : undefined,
      occurredAt: wallet.result.occurredAt,
      receivedAt: Date.now(),
      bankPending: wallet.result.bankPending || undefined,
      needsConfirmation: true,
      rawNotificationBody: notification.body,
    };
  } else {
    const { issuer, smsBody } = parsed.data;
    const sms = parseSmsByIssuer(issuer, smsBody);
    if (!sms.ok) {
      await safeLog(() =>
        appendUserWebhookLog(scope, {
          ts: startedAt,
          ok: false,
          status: 422,
          reason: sms.reason,
        }),
      );
      return fail(422, sms.reason, { missing: sms.missing });
    }
    if (!isKvConfigured()) {
      return Response.json({
        ok: true,
        persisted: false,
        reason: "kv_not_configured",
        parsed: sms.result,
      });
    }

    externalId = await externalIdFor(scope.id, smsBody);
    tx = {
      externalId,
      amount: sms.result.amount,
      category: sms.result.category,
      paymentMethod: "credit",
      installments: 1,
      issuer: sms.result.issuer,
      source: "sms",
      cardLast4: sms.result.cardLast4,
      merchant: sms.result.merchant,
      note: sms.result.applePay ? "Apple Pay" : undefined,
      occurredAt: sms.result.occurredAt,
      receivedAt: Date.now(),
      bankPending: sms.result.pending || undefined,
    };
  }

  const { added } = await pushTransaction(scope, tx);

  // Best-effort Web Push fan-out.
  let pushed: "sent" | "skipped" | "no_sub" | "gone" = "skipped";
  if (added && isPushConfigured()) {
    const sub = await getPushSubscription(scope);
    if (!sub) {
      pushed = "no_sub";
    } else {
      const result = await sendCategorizePush(sub, {
        kind: "categorize",
        externalId,
        deviceId: scope.id,
        amount: tx.amount,
        merchant: tx.merchant,
        cardLast4: tx.cardLast4,
        categoryHint: tx.category !== "other" ? tx.category : undefined,
        installments: tx.installments > 1 ? tx.installments : undefined,
        occurredAt: tx.occurredAt,
      });
      pushed = result.gone ? "gone" : result.ok ? "sent" : "skipped";
      if (result.gone) await deletePushSubscription(scope);
    }
  }

  const logEntry: WebhookLogEntry = {
    ts: startedAt,
    ok: true,
    status: 200,
    reason: added ? "saved" : "duplicate",
    externalId,
    pushed,
    merchant: tx.merchant,
  };
  await safeLog(() => appendUserWebhookLog(scope, logEntry));

  return Response.json({
    ok: true,
    persisted: true,
    duplicate: !added,
    externalId,
    pushed,
  });
}

export function GET(): Response {
  return fail(405, "method_not_allowed");
}

/** Read the JSON `error` field out of an already-prepared error Response. */
async function readErrorReason(res: Response): Promise<string> {
  try {
    const clone = res.clone();
    const data = (await clone.json()) as { error?: string };
    return data.error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}
