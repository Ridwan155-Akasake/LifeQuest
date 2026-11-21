/* HQ service worker — shows push notifications and handles their buttons.
 * Kept deliberately small: no offline caching yet (the app needs the server anyway). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "HQ" };
  }
  const options = {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    data: { url: data.url || "/", taskId: data.taskId },
    actions: data.taskId
      ? [
          { action: "done", title: "✓ Done" },
          { action: "snooze", title: "Snooze 1h" },
        ]
      : [],
  };
  event.waitUntil(self.registration.showNotification(data.title || "HQ", options));
});

self.addEventListener("notificationclick", (event) => {
  const { url, taskId } = event.notification.data || {};
  event.notification.close();

  if (taskId && (event.action === "done" || event.action === "snooze")) {
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, action: event.action }),
      }).then((res) => {
        // Signed out or the server refused: open the task instead of failing silently.
        if (!res.ok) return self.clients.openWindow(url || "/");
      }),
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(url || "/");
        return existing.focus();
      }
      return self.clients.openWindow(url || "/");
    }),
  );
});
