/* HQ service worker — shows push notifications and handles their buttons.
 * Kept deliberately small: no offline caching yet (the app needs the server anyway).
 *
 * Task reminder:   ✓ Done · ▶ Start · Snooze 15m (only while snoozes are left)
 * Focus check-in:  ✓ Done · +10 min
 * Nags and check-ins stay on screen until tapped (requireInteraction). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "HQ" };
  }
  let actions = [];
  if (data.focusId) {
    actions = [
      { action: "focus-done", title: "✓ Done" },
      { action: "focus-more", title: "+10 min" },
    ];
  } else if (data.taskId) {
    actions = [
      { action: "done", title: "✓ Done" },
      data.snoozesLeft > 0 ? { action: "snooze", title: `Snooze 15m (${data.snoozesLeft})` } : { action: "start", title: "▶ Start" },
    ];
  }
  const options = {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: Boolean(data.sticky),
    vibrate: data.sticky ? [300, 120, 300, 120, 600] : [120, 60, 120],
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    data: { url: data.url || "/", taskId: data.taskId, focusId: data.focusId, title: data.title || "" },
    actions,
  };
  event.waitUntil(self.registration.showNotification(data.title || "HQ", options));
});

function openApp(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (existing) {
      existing.navigate(url || "/");
      return existing.focus();
    }
    return self.clients.openWindow(url || "/");
  });
}

function post(body) {
  return fetch("/api/push/action", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

self.addEventListener("notificationclick", (event) => {
  const { url, taskId, focusId, title } = event.notification.data || {};
  const action = event.action;
  event.notification.close();

  // Start: stop the nag, then open HQ straight onto the focus timer for this task.
  if (taskId && action === "start") {
    const startUrl = `/?start=${encodeURIComponent(taskId)}&t=${encodeURIComponent(title || "")}`;
    event.waitUntil(post({ action: "start", taskId }).finally(() => openApp(startUrl)));
    return;
  }

  if ((taskId && (action === "done" || action === "snooze")) || (focusId && (action === "focus-done" || action === "focus-more"))) {
    event.waitUntil(
      post({ action, taskId, focusId }).then((res) => {
        // Signed out, no snoozes left, or refused: open the task instead of failing silently.
        if (!res.ok) return openApp(url || "/");
      }),
    );
    return;
  }

  // Tapping the notification body: open the task (a reminder) or HQ.
  event.waitUntil(openApp(url));
});
