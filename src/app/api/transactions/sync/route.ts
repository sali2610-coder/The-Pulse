import {
  isKvConfigured,
  pullTransactionsSince,
  readCategoryOverride,
} from "@/lib/kv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_DEVICE_ID_LEN = 128;
const SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function fail(status: number, code: string) {
  return Response.json({ ok: false, error: code }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const deviceId = req.headers.get("x-sally-device") ?? "";
  if (
    !deviceId ||
    deviceId.length > MAX_DEVICE_ID_LEN ||
    !/^[A-Za-z0-9_\-:.]+$/.test(deviceId)
  ) {
    return fail(400, "invalid_device");
  }

  if (!isKvConfigured()) {
    // Nothing to pull — endpoint is a no-op until Upstash is provisioned.
    return Response.json({
      ok: true,
      configured: false,
      transactions: [],
      now: Date.now(),
    });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const sinceParsed = sinceParam ? Number(sinceParam) : 0;
  const minSince = Date.now() - SYNC_LOOKBACK_MS;
  const since =
    Number.isFinite(sinceParsed) && sinceParsed > minSince
      ? sinceParsed
      : minSince;

  const transactions = await pullTransactionsSince(deviceId, since);
  // Overlay any category overrides from push notifications. This is a small
  // per-tx KV read; for 200 max items it's well within Edge limits.
  const overlaid = await Promise.all(
    transactions.map(async (tx) => {
      const override = await readCategoryOverride(deviceId, tx.externalId);
      return override ? { ...tx, category: override } : tx;
    }),
  );
  return Response.json({
    ok: true,
    configured: true,
    transactions: overlaid,
    now: Date.now(),
  });
}

export function POST(): Response {
  return fail(405, "method_not_allowed");
}
