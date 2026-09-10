// GTA CLOCK — Due-push dispatcher (shared by server scheduler, Vercel cron, CLI)
// Sends Web Push to every subscription whose per-timezone targetUtc has passed
// and that hasn't been notified yet. Works even when the user's tab is closed
// because delivery goes through the browser vendor's push service + our SW.
const webpush = require('web-push');
const {
  getDuePushSubscriptions,
  getAllPushSubscriptions,
  markPushNotified,
  prunePushSubscription
} = require('./push-subscribers');

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.error('VAPID keys missing: set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.');
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@gtaclock.com',
    pub,
    priv
  );
  vapidConfigured = true;
  return true;
}

function buildPayload(sub) {
  return JSON.stringify({
    title: 'GTA 6 is HERE! 🎮',
    body: 'Grand Theft Auto VI has launched in your timezone — the countdown is over, go play!',
    icon: '/assets/gta-vi-logo.png',
    badge: '/assets/gta-vi-logo.png',
    url: 'https://gtaclock.com',
    timezone: sub.timezone || undefined,
    // Lets the Service Worker (which runs even with the tab closed) validate
    // the alert against the device clock before displaying it.
    targetUtc: sub.targetUtc || undefined
  });
}

// Dispatch all due notifications. Returns a summary.
// Options: { now, dryRun, limit }
async function dispatchDuePush({ now = Date.now(), dryRun = false, limit = 500 } = {}) {
  if (!ensureVapid()) {
    return { ok: false, error: 'VAPID keys not configured', checked: 0, sent: 0, failed: 0, pruned: 0 };
  }

  const due = await getDuePushSubscriptions(now);
  const batch = due.slice(0, limit);

  let sent = 0;
  let failed = 0;
  let pruned = 0;
  const errors = [];

  for (const sub of batch) {
    if (dryRun) {
      sent++;
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime },
        buildPayload(sub)
      );
      await markPushNotified(sub.endpoint);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Endpoint expired/unsubscribed at browser level — drop it permanently.
        await prunePushSubscription(sub.endpoint);
        pruned++;
      } else {
        failed++;
        errors.push({ endpoint: String(sub.endpoint).slice(0, 80), message: err.message });
      }
    }
  }

  // checked = total stored (useful for observability)
  let checked = batch.length;
  try {
    const all = await getAllPushSubscriptions();
    checked = all.length;
  } catch (_) {}

  return { ok: true, checked, due: batch.length, sent, failed, pruned, errors, now: new Date(now).toISOString() };
}

module.exports = { dispatchDuePush, ensureVapid, buildPayload };
