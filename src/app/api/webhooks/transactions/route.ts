import { z } from "zod";
import { verifyHmac } from "@/lib/webhook-verify";
import { CATEGORY_IDS } from "@/lib/categories";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

const transactionPayloadSchema = z.object({
  externalId: z.string().min(1).max(128),
  amount: z.number().positive().max(1_000_000),
  currency: z.literal("ILS").default("ILS"),
  paymentMethod: z.enum(["cash", "credit"]).default("credit"),
  installments: z.number().int().min(1).max(60).default(1),
  category: z.enum(CATEGORY_IDS).optional(),
  merchant: z.string().max(120).optional(),
  note: z.string().max(200).optional(),
  occurredAt: z.string().datetime(),
});

export type TransactionPayload = z.infer<typeof transactionPayloadSchema>;

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return fail(503, "webhook_disabled");

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return fail(415, "unsupported_media_type");
  }

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    return fail(413, "payload_too_large");
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail(400, "unreadable_body");
  }
  if (raw.length > MAX_BODY_BYTES) return fail(413, "payload_too_large");

  const signature = req.headers.get("x-sally-signature") ?? "";
  const valid = await verifyHmac({ rawBody: raw, signatureHex: signature, secret });
  if (!valid) return fail(401, "invalid_signature");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_json");
  }

  const parsed = transactionPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return fail(422, "schema_violation");
  }

  // The client today is offline-first (zustand+localStorage). Without a
  // server-side database, we cannot directly mutate a specific user's state.
  // For now: log and acknowledge. When a DB lands, this is where we'd:
  //   1. Look up the user by externalId / Open Banking link.
  //   2. Insert the transaction (idempotent on externalId).
  //   3. Push to client via SSE/WebSocket so The Pulse animates.
  console.info("[webhook] tx accepted", {
    externalId: parsed.data.externalId,
    amount: parsed.data.amount,
    occurredAt: parsed.data.occurredAt,
  });

  return Response.json({ ok: true, accepted: parsed.data.externalId });
}

export function GET(): Response {
  return fail(405, "method_not_allowed");
}
