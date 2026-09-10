// GTA CLOCK — Service Worker for Web Push Notifications
// This runs independently of the page, enabling notifications even when the tab is closed.

self.addEventListener('push', function (event) {
  let data = {
    title: 'GTA 6 is HERE!',
    body: 'Grand Theft Auto VI has launched! The countdown is over — go play!',
    icon: '/assets/gta-vi-logo.png',
    badge: '/assets/gta-vi-logo.png',
    url: 'https://gtaclock.com'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      // If the payload is plain text, use it as the body
      data.body = event.data.text() || data.body;
    }
  }

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

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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
