export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Plain-text health endpoint. No React, no JS, no auth. If this responds,
 * the network path + Vercel runtime are healthy; any "couldn't load" on
 * the main app is React-side or browser-cache-side.
 */
export function GET(): Response {
  return new Response("ok\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
