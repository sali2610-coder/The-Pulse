// Pure-static lite entry — also performs an aggressive client-side
// cleanup: unregisters every Service Worker for the origin, deletes
// every Cache Storage entry, wipes localStorage / sessionStorage /
// IndexedDB. /lite is the user's escape hatch when the rest of the
// origin is being intercepted by a stuck Service Worker that won't yield
// to the new self-destruct SW.
//
// The cleanup runs on page load BEFORE the user can click into other
// pages — so by the time they navigate to /, no stale SW or cached
// chunk is in the way.

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>Sally · Lite</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{background:#0a0a0a;color:#f5f5f5;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100dvh}
    body{padding:max(env(safe-area-inset-top),24px) 20px max(env(safe-area-inset-bottom),24px)}
    .wrap{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
    .brand{font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#D4AF37;text-align:right}
    h1{font-size:24px;font-weight:300;line-height:1.2;text-align:right}
    .card{background:rgba(26,26,26,0.92);border:1px solid rgba(255,255,255,0.06);border-radius:24px;padding:20px}
    .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .row:last-child{border-bottom:none}
    .label{color:#8A8A8A;font-size:13px}
    .value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600;direction:ltr}
    .pill{display:inline-block;padding:4px 10px;border-radius:999px;background:#34D399;color:#062E1B;font-size:11px;font-weight:700;letter-spacing:0.05em}
    .pill-warn{background:#F5C451}
    .pill-busy{background:#A1A1AA;color:#0a0a0a}
    a{color:#00E5FF;text-decoration:none}
    a:hover{text-decoration:underline}
    p{color:#A1A1AA;font-size:13px;line-height:1.6;text-align:right}
    button{font:inherit;cursor:pointer;border:none}
    .btn-primary{display:flex;align-items:center;justify-content:center;width:100%;padding:14px;border-radius:16px;background:linear-gradient(180deg,#34D399 0%,#10B981 100%);color:#062E1B;font-weight:700;font-size:15px;text-align:center}
    .btn-primary:disabled{opacity:0.4;cursor:not-allowed}
    .log{background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;font-family:ui-monospace,monospace;font-size:11px;color:#A1A1AA;white-space:pre-wrap;direction:ltr;text-align:left;max-height:200px;overflow-y:auto}
    .ok{color:#34D399}
    .fail{color:#F87171}
    .links{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .links a{display:inline-block;padding:8px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Sally · Lite</div>
    <h1>תקציב נקי, החלטות חכמות.</h1>

    <div class="card">
      <div class="row">
        <span class="label">סטטוס שרת</span>
        <span class="pill">ONLINE</span>
      </div>
      <div class="row">
        <span class="label">ניקוי קליינט</span>
        <span class="pill pill-busy" id="status">RUNNING</span>
      </div>
    </div>

    <div class="card">
      <p style="text-align:right">דף זה מנקה אוטומטית את כל ה־Service Workers, ה־Cache Storage, ה־localStorage וה־IndexedDB שלך באתר הזה. כשהסטטוס יעלה <strong>DONE</strong>, לחץ על הכפתור הירוק כדי לפתוח את הדאשבורד.</p>
    </div>

    <pre class="log" id="log">starting cleanup…\n</pre>

    <button class="btn-primary" id="open" disabled>פתח את האפליקציה</button>

    <div class="links">
      <a href="/healthz">/healthz</a>
      <a href="/debug">/debug</a>
      <a href="/debug-react">/debug-react</a>
    </div>
  </div>

  <script>
    (async function () {
      var log = document.getElementById("log");
      var status = document.getElementById("status");
      var openBtn = document.getElementById("open");
      function line(text, cls) {
        var span = document.createElement("span");
        if (cls) span.className = cls;
        span.textContent = text + "\\n";
        log.appendChild(span);
      }
      try {
        if ("serviceWorker" in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations();
          for (var i = 0; i < regs.length; i++) {
            try {
              await regs[i].unregister();
              line("unregistered SW: " + (regs[i].scope || ""), "ok");
            } catch (e) {
              line("SW unregister failed: " + e, "fail");
            }
          }
          if (regs.length === 0) line("no SW registrations", "ok");
        }
      } catch (e) { line("SW step error: " + e, "fail"); }
      try {
        if ("caches" in window) {
          var keys = await caches.keys();
          for (var k = 0; k < keys.length; k++) {
            await caches.delete(keys[k]);
            line("deleted cache: " + keys[k], "ok");
          }
          if (keys.length === 0) line("no cache entries", "ok");
        }
      } catch (e) { line("caches step error: " + e, "fail"); }
      try { localStorage.clear(); line("localStorage cleared", "ok"); }
      catch (e) { line("localStorage error: " + e, "fail"); }
      try { sessionStorage.clear(); line("sessionStorage cleared", "ok"); }
      catch (e) { line("sessionStorage error: " + e, "fail"); }
      try {
        if (indexedDB && indexedDB.databases) {
          var dbs = await indexedDB.databases();
          for (var d = 0; d < dbs.length; d++) {
            var name = dbs[d].name;
            if (!name) continue;
            await new Promise(function (resolve) {
              var req = indexedDB.deleteDatabase(name);
              req.onsuccess = req.onerror = req.onblocked = function () { resolve(null); };
            });
            line("deleted IDB: " + name, "ok");
          }
          if (dbs.length === 0) line("no IndexedDB databases", "ok");
        }
      } catch (e) { line("idb step error: " + e, "fail"); }
      line("done.", "ok");
      status.textContent = "DONE";
      status.className = "pill";
      openBtn.disabled = false;
      openBtn.onclick = function () {
        // hard-reload to / bypassing any HTTP cache
        window.location.replace("/?fresh=" + Date.now());
      };
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
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      // Network-level wipe — drops cookies + cached responses for this origin.
      "Clear-Site-Data": '"cache", "cookies", "storage"',
    },
  });
}
