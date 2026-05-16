// Sally PWA service worker — shell cache + Web Push categorize prompt.
// Bump SW_VERSION whenever cache shape changes so stale workers retire.
const SW_VERSION = "sally-v3";
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
  const cardSuffix = payload.cardLast4 ? ` ····${payload.cardLast4}` : "";

  const title = `${merchant} · ${amount}`;
  const body = `Sally — בחר קטגוריה${cardSuffix}`;

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
      },
      actions: [
        { action: "food", title: "אוכל" },
        { action: "transport", title: "תחבורה" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const externalId = data.externalId;
  const action = event.action;

  event.notification.close();

  if (!externalId) return;

  // Quick-action buttons → fast categorize, no nav.
  const QUICK_ACTION_TO_CATEGORY = {
    food: "food",
    transport: "transport",
  };
  const quickCategory = QUICK_ACTION_TO_CATEGORY[action];

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

  // Body tap (no action) → deep-link into the confirmation sheet so the
  // user can review merchant, category, amount, installments.
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
