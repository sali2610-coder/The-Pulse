// Sally minimal Service Worker — push notifications only.
//
// No shell caching, no offline mode, no fetch intercept. Earlier versions
// (sally-v* family) intercepted every navigation and broke recoverability
// when chunks rotated. This SW exists for exactly one job: render incoming
// Web Push notifications and route the user back into the app when they
// tap one.

const SW_VERSION = "sally-push-v4";

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

const ALERT_META = {
  info:     { emoji: "ℹ️" },
  positive: { emoji: "✨" },
  warning:  { emoji: "⚠️" },
  danger:   { emoji: "🚨" },
};

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (err) {
    console.error("[sw] push payload parse failed", err);
    payload = null;
  }
  console.info("[sw] push event received", payload?.kind, payload?.externalId);
  if (!payload) {
    // Show a generic notification so the user knows something arrived
    // even when the payload format is wrong — better than silent drop.
    event.waitUntil(
      self.registration.showNotification("Sally", {
        body: "התקבל חיוב חדש",
        icon: "/icon.svg",
        tag: "sally-generic",
      }),
    );
    return;
  }

  if (payload.kind === "alert") {
    const meta = ALERT_META[payload.severity] || ALERT_META.info;
    const title = `${meta.emoji} ${payload.title || "Sally"}`;
    event.waitUntil(
      self.registration.showNotification(title, {
        body: payload.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: `sally-alert-${payload.id}`,
        renotify: false,
        requireInteraction: payload.severity === "danger",
        data: {
          href: payload.href || "/",
        },
      }),
    );
    return;
  }

  if (payload.kind !== "categorize") return;

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

  // No action buttons. Tapping anywhere on the notification (body OR
  // action area) must open the confirmation sheet — quick-confirm
  // shortcuts were hijacking taps on iOS where the body region is
  // narrow and easy to mis-tap.
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
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  // Alert push — deep-link to the supplied href.
  if (data.href && !data.externalId) {
    event.waitUntil(openClient(data.href));
    return;
  }

  const externalId = data.externalId;
  if (!externalId) return;

  const target = `/confirm/${encodeURIComponent(externalId)}`;
  console.info("[sw] notificationclick → ", target);
  event.waitUntil(openClient(target, { externalId }));
});

/**
 * Open the PWA at `path` and tell every controlled client where to go.
 *
 * iOS Safari PWA has two known quirks that conspire against the
 * notification → deep-link flow:
 *
 *   1. `WindowClient.navigate()` succeeds but sometimes doesn't actually
 *      change the URL in a standalone PWA — the focus call wins and the
 *      tab stays on whatever it was showing.
 *   2. `clients.openWindow()` returns null when the PWA is already open
 *      in standalone mode, leaving the user staring at the previous
 *      screen.
 *
 * Mitigation: always postMessage every controlled client BEFORE the
 * navigate/openWindow attempt. The app listens for the message and
 * performs the navigation client-side via the Next router, which works
 * regardless of which iOS quirk hits.
 */
async function openClient(path, meta) {
  const target = path || "/";
  const externalId = meta && meta.externalId ? meta.externalId : null;
  const list = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // 1. postMessage every client first.
  for (const client of list) {
    try {
      client.postMessage({
        type: "sally:pending-confirm",
        externalId,
        path: target,
        ts: Date.now(),
      });
    } catch {
      /* ignore */
    }
  }

  // 2. Try to focus + navigate an existing client.
  for (const client of list) {
    if ("focus" in client) {
      try {
        await client.focus();
        if ("navigate" in client && client.url !== target) {
          try {
            await client.navigate(target);
          } catch {
            /* navigate may fail on iOS standalone — postMessage covers it */
          }
        }
        return;
      } catch {
        /* fall through */
      }
    }
  }

  // 3. No existing client → open a fresh window.
  if (self.clients.openWindow) {
    await self.clients.openWindow(target);
  }
}

void SW_VERSION;
