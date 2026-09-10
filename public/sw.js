// GTA CLOCK — Service Worker for Web Push Notifications
// Runs independently of the page, enabling notifications even when the tab is closed.
//
// Timing model (server authoritative, client validated):
//   1. Server checks every minute which subscriptions are due
//      (targetUtc = Nov 19 00:00 in each subscriber's timezone) and pushes.
//   2. This worker validates the push against the device clock before showing:
//      - due or slightly early  -> show immediately
//      - moderately early       -> wait until due, then show (short defer)
//      - absurdly early / bad   -> show anyway (fail-open: a possibly-early
//        alert is better than a silently dropped launch alert)

const DEFAULT_DATA = {
  title: 'GTA 6 is HERE!',
  body: 'Grand Theft Auto VI has launched! The countdown is over — go play!',
  icon: '/assets/gta-vi-logo.png',
  badge: '/assets/gta-vi-logo.png',
  url: 'https://gtaclock.com'
};

// How long the worker will defer an early push to hit the exact due time.
// Beyond this, it shows immediately (fail-open; the worker may be killed
// if kept alive for too long, which would lose the notification entirely).
const MAX_DEFER_MS = 5 * 60 * 1000;

function parsePushData(event) {
  let data = { ...DEFAULT_DATA };
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      // If the payload is plain text, use it as the body
      data.body = event.data.text() || data.body;
    }
  }
  return data;
}

function showLaunchNotification(data) {
  const options = {
    body: data.body,
    icon: data.icon || '/assets/gta-vi-logo.png',
    badge: data.badge || '/assets/gta-vi-logo.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'gta6-launch',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || 'https://gtaclock.com'
    },
    actions: [
      { action: 'open', title: 'Open GTA Clock' }
    ]
  };
  return self.registration.showNotification(data.title, options);
}

self.addEventListener('push', function (event) {
  const data = parsePushData(event);
  const now = Date.now();
  const target = typeof data.targetUtc === 'number' ? data.targetUtc : 0;
  const waitMs = target - now;

  if (waitMs > 0 && waitMs <= MAX_DEFER_MS) {
    // Push arrived a little early (scheduler tick / delivery latency):
    // hold it and display exactly when the subscriber's midnight hits.
    event.waitUntil(
      new Promise(function (resolve) {
        setTimeout(function () {
          showLaunchNotification(data).then(resolve, resolve);
        }, waitMs);
      })
    );
  } else {
    // Due, overdue, or unreasonably early -> show immediately (fail-open).
    event.waitUntil(showLaunchNotification(data));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || 'https://gtaclock.com';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus an existing tab if one is open
      for (const client of clientList) {
        if (client.url.includes('gtaclock') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(targetUrl);
    })
  );
});

// Activate immediately on install
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
