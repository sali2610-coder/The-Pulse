// Sally minimal Service Worker — push notifications only.
//
// No shell caching, no offline mode, no fetch intercept. Earlier versions
// (sally-v* family) intercepted every navigation and broke recoverability
// when chunks rotated. This SW exists for exactly one job: render incoming
// Web Push notifications and route the user back into the app when they
// tap one.

const SW_VERSION = "sally-push-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  // Clean up any cache left behind by older SW versions so old chunks
  // never get served.
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.clients.claim();
      } catch {
        /* ignore */
      }
    })(),
  );
});

// IMPORTANT: do not intercept fetches. Every request goes straight to the
// network. This SW is purely a notification surface.
self.addEventListener("fetch", () => {
  /* no-op */
});

const ILS = (n) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);

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
  const title = `${emoji}${merchant}${amount ? " · " + amount : ""}`;

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
        /* fall through */
      }
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(target);
  }
}

void SW_VERSION;
