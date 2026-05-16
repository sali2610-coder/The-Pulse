// Self-cleaning recovery page.
//
// Open in Safari when stuck on "This page couldn't load". The inline
// script unregisters every Service Worker for the origin, deletes every
// Cache Storage entry, clears localStorage + sessionStorage + IndexedDB,
// and then redirects to `/`. The `Clear-Site-Data` header also nudges
// the browser to drop cookies for the origin (Vercel SSO nonce, Clerk
// dev-browser cookie, etc.) at the network layer.
//
// Idempotent. Safe to bookmark.

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sally · /reset</title>
  <style>
    body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 2rem; background: #0a0a0a; color: #f5f5f5; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    pre { background: rgba(255,255,255,0.04); padding: 1rem; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
    a { color: #00E5FF; }
    .done { color: #34D399; }
    .fail { color: #F87171; }
  </style>
</head>
<body>
  <h1>Sally · <code>/reset</code></h1>
  <p>Clearing every client-side cache for this origin…</p>
  <pre id="log">starting…\n</pre>
  <p><a id="continue" href="/" style="display:none">המשך אל הדאשבורד →</a></p>
  <script>
    (async function reset() {
      const log = document.getElementById("log");
      const cont = document.getElementById("continue");
      function line(text, ok) {
        const span = document.createElement("span");
        span.className = ok === false ? "fail" : ok === true ? "done" : "";
        span.textContent = text + "\\n";
        log.appendChild(span);
      }
      // 1. Service Workers
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            try { await r.unregister(); line("unregistered SW: " + (r.scope || ""), true); }
            catch (e) { line("SW unregister failed: " + e, false); }
          }
          if (regs.length === 0) line("no SW registrations", true);
        } catch (e) { line("SW getRegistrations failed: " + e, false); }
      } else { line("serviceWorker API not available", true); }
      // 2. Cache Storage
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          for (const k of keys) {
            await caches.delete(k);
            line("deleted cache: " + k, true);
          }
          if (keys.length === 0) line("no cache entries", true);
        } catch (e) { line("caches.keys failed: " + e, false); }
      }
      // 3. localStorage + sessionStorage
      try { localStorage.clear(); line("localStorage cleared", true); } catch (e) { line("localStorage clear failed: " + e, false); }
      try { sessionStorage.clear(); line("sessionStorage cleared", true); } catch (e) { line("sessionStorage clear failed: " + e, false); }
      // 4. IndexedDB
      if (indexedDB && indexedDB.databases) {
        try {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
              });
              line("deleted IDB: " + db.name, true);
            }
          }
          if (dbs.length === 0) line("no IndexedDB databases", true);
        } catch (e) { line("indexedDB.databases failed: " + e, false); }
      }
      line("done.", true);
      cont.style.display = "inline-block";
      // Auto-redirect after 1.5s
      setTimeout(() => { window.location.replace("/?reset=1"); }, 1500);
    })();
  </script>
</body>
</html>
`;

export function GET(): Response {
  return new Response(HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Belt-and-suspenders network-layer wipe.
      "Clear-Site-Data": '"cache", "cookies", "storage"',
    },
  });
}
