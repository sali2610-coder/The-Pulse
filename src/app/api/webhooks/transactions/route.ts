import { z } from "zod";
import { parseSmsByIssuer } from "@/lib/parsers";
import { externalIdFor } from "@/lib/parsers/helpers";
import { pushTransaction, isKvConfigured, type StoredTransaction } from "@/lib/kv";

export const runtime = "edge";
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

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return fail(503, "webhook_disabled");

  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!timingSafeEqual(auth, expected)) {
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
  if (!parsed.success) {
    return fail(422, "schema_violation");
  }

  const { issuer, smsBody } = parsed.data;
  const sms = parseSmsByIssuer(issuer, smsBody);
  if (!sms.ok) {
    return fail(422, sms.reason, { missing: sms.missing });
  }

  if (!isKvConfigured()) {
    // Successful parse but no DB to persist — return 200 with a flag so the
    // user knows to provision Upstash. The Shortcut still considers it a
    // successful send.
    return Response.json({
      ok: true,
      persisted: false,
      reason: "kv_not_configured",
      parsed: sms.result,
    });
  }

  const externalId = await externalIdFor(deviceId, smsBody);
  const tx: StoredTransaction = {
    externalId,
    amount: sms.result.amount,
    category: sms.result.category,
    paymentMethod: "credit", // SMS-driven entries are always credit-card.
    installments: 1, // SMS doesn't expose installment count reliably.
    issuer: sms.result.issuer,
    cardLast4: sms.result.cardLast4,
    merchant: sms.result.merchant,
    note: sms.result.applePay ? "Apple Pay" : undefined,
    occurredAt: sms.result.occurredAt,
    receivedAt: Date.now(),
  };

  const { added } = await pushTransaction(deviceId, tx);
  return Response.json({
    ok: true,
    persisted: true,
    duplicate: !added,
    externalId,
  });
}

export function GET(): Response {
  return fail(405, "method_not_allowed");
}
