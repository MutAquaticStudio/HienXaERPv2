/* F5 web push: shows what the ERP sends and opens its page when tapped. No caching, no offline mode. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Hiền Xa ERP", {
    body: data.body || "", tag: data.tag || undefined, icon: "/icon-192.png", badge: "/icon-192.png", data: { link: data.link || "/" },
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
