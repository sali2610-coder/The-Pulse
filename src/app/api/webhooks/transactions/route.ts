import { z } from "zod";
import { parseSmsByIssuer } from "@/lib/parsers";
import { externalIdFor } from "@/lib/parsers/helpers";
import {
  pushTransaction,
  isKvConfigured,
  getPushSubscription,
  deletePushSubscription,
  type StoredTransaction,
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

function fail(status: number, code: string, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: code, ...(extra ?? {}) }, { status });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Resolve the inbound webhook to a Scope.
 *
 * - **Multi-user mode (AUTH_ENABLED=true)**: requires `Authorization: Bearer
 *   stk_<token>`. The token resolves to a Clerk userId via Upstash. Global
 *   `WEBHOOK_SECRET` is rejected because there's no way to attribute its
 *   transactions to a specific user.
 * - **Legacy single-user (AUTH_ENABLED=false)**: requires global
 *   `WEBHOOK_SECRET` + `x-sally-device` header.
 */
async function resolveScope(req: Request): Promise<Scope | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (AUTH_ENABLED) {
    if (!bearer.startsWith("stk_")) return fail(401, "missing_personal_token");
    const userId = await resolveTokenToUserId(bearer);
    if (!userId) return fail(401, "invalid_token");
    return { kind: "user", id: userId };
  }

  // Legacy mode.
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return fail(503, "webhook_disabled");
  if (!timingSafeEqual(bearer, secret)) {
    return fail(401, "invalid_token");
  }
  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !/^[A-Za-z0-9_\-:.]+$/.test(deviceId)
  ) {
    return fail(400, "invalid_device");
  }
  return { kind: "device", id: deviceId };
}

export async function POST(req: Request): Promise<Response> {
  const scopeOr = await resolveScope(req);
  if (scopeOr instanceof Response) return scopeOr;
  const scope = scopeOr;

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return fail(413, "payload_too_large");
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail(400, "unreadable_body");
  }
  if (raw.length > MAX_BODY_BYTES) return fail(413, "payload_too_large");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_json");
  }

  const parsed = smsBodySchema.safeParse(json);
  if (!parsed.success) return fail(422, "schema_violation");

  const { issuer, smsBody } = parsed.data;
  const sms = parseSmsByIssuer(issuer, smsBody);
  if (!sms.ok) return fail(422, sms.reason, { missing: sms.missing });

  if (!isKvConfigured()) {
    return Response.json({
      ok: true,
      persisted: false,
      reason: "kv_not_configured",
      parsed: sms.result,
    });
  }

  const externalId = await externalIdFor(scope.id, smsBody);
  const tx: StoredTransaction = {
    externalId,
    amount: sms.result.amount,
    category: sms.result.category,
    paymentMethod: "credit",
    installments: 1,
    issuer: sms.result.issuer,
    cardLast4: sms.result.cardLast4,
    merchant: sms.result.merchant,
    note: sms.result.applePay ? "Apple Pay" : undefined,
    occurredAt: sms.result.occurredAt,
    receivedAt: Date.now(),
  };

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
        // Echo the scope id back to the SW so notificationclick can attribute
        // its categorize POST to the right user / device.
        deviceId: scope.id,
        amount: tx.amount,
        merchant: tx.merchant,
        cardLast4: tx.cardLast4,
      });
      pushed = result.gone ? "gone" : result.ok ? "sent" : "skipped";
      if (result.gone) await deletePushSubscription(scope);
    }
  }

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
