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
// Options: { now, dryRun, limit, concurrency }
async function dispatchDuePush({ now = Date.now(), dryRun = false, limit = 500, concurrency = 10 } = {}) {
  if (!ensureVapid()) {
    return { ok: false, error: 'VAPID keys not configured', checked: 0, sent: 0, failed: 0, pruned: 0 };
  }

  const due = await getDuePushSubscriptions(now);
  const batch = due.slice(0, limit);

  let sent = 0;
  let failed = 0;
  let pruned = 0;
  const errors = [];

  // Bounded concurrency pool: the old sequential await took ~500 * RTT for
  // large batches; 10 in flight keeps push-service latency overlapped
  // without hammering it.
  async function sendOne(sub) {
    if (dryRun) {
      sent++;
      return;
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

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), batch.length) },
    async () => {
      while (batch.length > 0) {
        const sub = batch.shift();
        if (!sub) break;
        await sendOne(sub);
      }
    }
  );
  await Promise.all(workers);

  // checked = total stored (useful for observability). getDuePush already
  // read the full store, so derive without a second round-trip when small.
  let checked = due.length;
  try {
    const all = await getAllPushSubscriptions();
    checked = all.length;
  } catch (_) {}

  return { ok: true, checked, due: due.length, sent, failed, pruned, errors, now: new Date(now).toISOString() };
}

module.exports = { dispatchDuePush, ensureVapid, buildPayload };
