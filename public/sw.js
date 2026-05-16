// Sally PWA service worker — shell cache + Web Push categorize prompt.
// Bump SW_VERSION whenever cache shape changes so stale workers retire.
const SW_VERSION = "sally-v4";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((m) => m || Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200) return res;
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        return res;
      });
    }),
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Web Push: receive a "categorize" prompt and surface 3 quick actions.
// iOS Safari supports up to 2 visible action buttons; we render the third
// option ("personal") as the default tap target.
// ────────────────────────────────────────────────────────────────────────────

const ILS = (n) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);

// Small emoji map keeps the SW self-contained — can't import from
// src/lib/categories.ts inside a service worker.
const CATEGORY_META = {
  food: { emoji: "🍔", label: "אוכל" },
  transport: { emoji: "🚗", label: "תחבורה" },
  shopping: { emoji: "🛍️", label: "קניות" },
  entertainment: { emoji: "🎬", label: "בילויים" },
  bills: { emoji: "🧾", label: "חשבונות" },
  health: { emoji: "❤️", label: "בריאות" },
  education: { emoji: "🎓", label: "חינוך" },
  gifts: { emoji: "🎁", label: "מתנות" },
  other: { emoji: "✨", label: "אחר" },
};

function shortTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || payload.kind !== "categorize") return;

  const merchant = payload.merchant ?? "חיוב חדש";
  const amount = typeof payload.amount === "number" ? ILS(payload.amount) : "";
  const hint = payload.categoryHint ? CATEGORY_META[payload.categoryHint] : null;
  const emoji = hint ? `${hint.emoji} ` : "";

  // Title: "🍔 שופרסל · ₪42"
  const title = `${emoji}${merchant}${amount ? " · " + amount : ""}`;

  // Body segments — joined by " · " so each one is optional:
  //   • cardLast4 → "····1234"
  //   • installments → "12× תשלומים"
  //   • occurredAt → "14:32"
  const bodyParts = [];
  if (payload.cardLast4) bodyParts.push(`····${payload.cardLast4}`);
  if (payload.installments && payload.installments > 1) {
    bodyParts.push(`${payload.installments}× תשלומים`);
  }
  const t = payload.occurredAt ? shortTime(payload.occurredAt) : "";
  if (t) bodyParts.push(t);
  const body = bodyParts.length > 0
    ? bodyParts.join(" · ")
    : "Sally — בחר קטגוריה";

  // Actions:
  //   - With a heuristic hint: "אישור — {label}" + "ערוך"
  //   - Without: quick "אוכל" + "תחבורה" picks
  const actions = hint
    ? [
        { action: `confirm:${payload.categoryHint}`, title: `אישור — ${hint.label}` },
        { action: "edit", title: "ערוך" },
      ]
    : [
        { action: "food", title: "אוכל" },
        { action: "transport", title: "תחבורה" },
      ];

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: `sally-cat-${payload.externalId}`,
      renotify: false,
      requireInteraction: false,
      data: {
        externalId: payload.externalId,
        deviceId: payload.deviceId,
        categoryHint: payload.categoryHint || null,
      },
      actions,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const externalId = data.externalId;
  const action = event.action;

  event.notification.close();

  if (!externalId) return;

  // Quick-action buttons resolve to a category id:
  //   - "food" / "transport" → that category directly
  //   - "confirm:<cat>" → approve the heuristic from the server payload
  // "edit" (and body tap) skip the fetch and deep-link to /confirm.
  let quickCategory = null;
  if (action === "food") quickCategory = "food";
  else if (action === "transport") quickCategory = "transport";
  else if (action && action.startsWith("confirm:")) {
    quickCategory = action.slice("confirm:".length);
  }

  if (quickCategory) {
    event.waitUntil(
      fetch("/api/push/categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sally-device": data.deviceId || "",
        },
        body: JSON.stringify({ externalId, category: quickCategory }),
        keepalive: true,
      })
        .catch(() => undefined)
        .then(() => focusOrOpen("/")),
    );
    return;
  }

  // "edit" or body tap → deep-link into the confirmation sheet so the user
  // can review merchant, category, amount, installments.
  event.waitUntil(focusOrOpen(`/confirm/${encodeURIComponent(externalId)}`));
});

async function focusOrOpen(path) {
  const target = path || "/";
  const list = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of list) {
    if ("focus" in client && "navigate" in client) {
      try {
        await client.focus();
        await client.navigate(target);
        return;
      } catch {
        /* fall through to openWindow */
      }
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(target);
  }
}
