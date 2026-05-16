// Plain-HTML smoke test. No React, no client components, no Next root
// layout, no Providers, no MotionConfig, no service worker reference,
// no manifest, no PWA hints. If this page renders in Safari and `/` does
// not, the failure is in the React shell or the registered SW.
//
// `Cache-Control: no-store` + `Clear-Site-Data` on this route is
// intentional — it lets the user blow away any prior cached failure for
// this origin while reading the response.

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sally · /debug</title>
  <style>
    body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 2rem; background: #0a0a0a; color: #f5f5f5; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; }
    a { color: #00E5FF; }
    p { margin: .75rem 0; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #34D399; color: #062E1B; font-weight: 600; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Sally · <code>/debug</code></h1>
  <p><span class="pill">SERVER OK</span></p>
  <p>This page is pure HTML. No React, no PWA, no Service Worker, no JavaScript.</p>
  <p>If <em>this</em> renders in Safari but <a href="/">/</a> does not, the failure is in the React shell or the cached Service Worker.</p>
  <p>Next: try <a href="/reset">/reset</a> to unregister any stale Service Worker and clear caches, then <a href="/">/</a>.</p>
  <p>Other endpoints:</p>
  <ul>
    <li><a href="/healthz">/healthz</a> — plain "ok"</li>
    <li><a href="/debug-react">/debug-react</a> — minimal React, single component</li>
    <li><a href="/">/</a> — full dashboard</li>
  </ul>
</body>
</html>
`;

export function GET(): Response {
  return new Response(HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
