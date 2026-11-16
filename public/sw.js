/* F5 web push: shows what the ERP sends and opens its page when tapped. No caching, no offline mode. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  // D92: after showing it, tell the open pages so they re-read their data (LiveRefresh) without a tap.
  event.waitUntil(self.registration.showNotification(data.title || "Hiền Xa ERP", {
    body: data.body || "", tag: data.tag || undefined, icon: "/icon-192.png", badge: "/icon-192.png", data: { link: data.link || "/" },
  }).then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true })).then((windows) => {
    for (const client of windows) client.postMessage({ type: "hx-push", kind: data.kind || null, id: data.id || null });
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) if (client.url === link && "focus" in client) return client.focus();
    return self.clients.openWindow(link);
  }));
});
