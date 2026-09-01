const CACHE = "levelupx-offline-v2";
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icon.svg"];

async function loadStaticAsset(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const res = await fetch(request);
  const copy = res.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.startsWith("/api")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(loadStaticAsset(request));
  }
});

self.addEventListener("push", (event) => {
  const notification = event.data?.json?.() ?? {
    title: "LevelUpX",
    body: "You have a new notification."
  };

  event.waitUntil(
    self.registration.showNotification(notification.title ?? "LevelUpX", {
      body: notification.body ?? "You have a new notification.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: {
        url: notification.url ?? "/notifications"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/notifications";
  event.waitUntil(self.clients.openWindow(url));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "levelupx-sync") {
    return;
  }

  // TODO: replay here once the IndexedDB queue code is shared with this bundle.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "FLUSH_OFFLINE_ACTIONS" });
      }
    })
  );
});
