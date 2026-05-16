// Pure-static lite entry. Identical visual concept to the dashboard but
// stripped to plain HTML + inline CSS. No React, no Next root layout, no
// Tailwind, no Framer Motion, no fonts, no images, no JS.
//
// Purpose: if `/lite` renders in Safari but `/` does NOT, the failure is
// somewhere in the Next.js + React + Tailwind + Framer pipeline. If
// `/lite` also fails, the issue is network/TLS/HSTS at the user's
// machine and no code change here can fix it.

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
    a{color:#00E5FF;text-decoration:none}
    a:hover{text-decoration:underline}
    p{color:#A1A1AA;font-size:13px;line-height:1.6}
    .links{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .links a{display:inline-block;padding:8px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Sally · Lite</div>
    <h1>תקציב נקי, החלטות חכמות.</h1>
    <div class="card">
      <p style="text-align:right">דף זה הוא HTML טהור. ללא React, ללא JavaScript, ללא Service Worker, ללא PWA. אם הוא נטען בדפדפן שלך, סימן שהשרת והרשת תקינים. אם הוא לא נטען, התקלה היא ברמת הרשת או הדפדפן ולא בקוד האפליקציה.</p>
    </div>
    <div class="card">
      <div class="row">
        <span class="label">סטטוס שרת</span>
        <span class="pill">ONLINE</span>
      </div>
      <div class="row">
        <span class="label">דף נטען</span>
        <span class="value">/lite</span>
      </div>
      <div class="row">
        <span class="label">סוג</span>
        <span class="value">static HTML</span>
      </div>
    </div>
    <div class="links">
      <a href="/healthz">/healthz</a>
      <a href="/debug">/debug</a>
      <a href="/debug-react">/debug-react</a>
      <a href="/reset">/reset</a>
      <a href="/">/ (full app)</a>
    </div>
  </div>
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
