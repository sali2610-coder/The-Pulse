// Service Worker self-destruct.
//
// Replaces the previous Sally SW (sally-v* family). When a browser that
// still has an old SW installed fetches /sw.js, this version installs,
// immediately unregisters itself, deletes every cache it owns, and
// notifies controlled clients to navigate to a fresh page so they leave
// the dead-SW scope.
//
// Once every active client has cycled past this, the next page load is
// served straight from the network with no SW in the way.

const SW_VERSION = "sally-v6-self-destruct";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache this origin owns.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      // Unregister ourselves so future navigations bypass the SW entirely.
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      // Force every currently-controlled client to reload from the
      // network, no SW in the picture.
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.navigate(client.url).catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    })(),
  );
});

// Pass every fetch straight to the network — no caching, no intercept.
self.addEventListener("fetch", () => {
  /* no-op */
});

// Ignore push events while shutting down.
self.addEventListener("push", () => {
  /* no-op */
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
});

void SW_VERSION;
