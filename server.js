const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const {
  savePushSubscription,
  updatePushSubscriptionTimezone,
  removePushSubscription
} = require('./lib/push-subscribers');
const { normalizeTimeZone } = require('./lib/launch-time');
const { dispatchDuePush } = require('./lib/dispatch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Accept both shapes:
//   new:    { subscription: {...}, timezone: 'Europe/London' }
//   legacy: { endpoint, keys, ... } (+ optional top-level timezone)
function extractSubscribeBody(body) {
  if (!body || typeof body !== 'object') return { subscription: null, timezone: null };
  if (body.subscription && typeof body.subscription === 'object') {
    return {
      subscription: body.subscription,
      timezone: body.timezone || body.subscription.timezone || null
    };
  }
  return { subscription: body, timezone: body.timezone || null };
}

// Subscribe for launch push (timezone-aware)
app.post('/api/push-subscribe', async (req, res) => {
  try {
    const { subscription, timezone } = extractSubscribeBody(req.body);

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid push subscription. Must include endpoint and keys.'
      });
    }

    const tz = normalizeTimeZone(
      timezone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return 'UTC'; } })()
    );
    const result = await savePushSubscription(subscription, tz);
    return res.json(result);
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error. Please try again.' });
  }
});

// Update timezone after user changes it (re-arms notification for new targetUtc)
app.post('/api/push-update', async (req, res) => {
  try {
    const { endpoint, timezone } = req.body || {};
    if (!endpoint || !timezone) {
      return res.status(400).json({ success: false, error: 'endpoint and timezone are required.' });
    }
    const updated = await updatePushSubscriptionTimezone(endpoint, timezone);
    if (!updated) return res.status(404).json({ success: false, error: 'Subscription not found.' });
    return res.json({ success: true, timezone: updated.timezone, targetUtc: updated.targetUtc });
  } catch (error) {
    console.error('Push update error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Cancel / unsubscribe (client also calls pushManager.unsubscribe())
app.post('/api/push-unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint is required.' });
    }
    const result = await removePushSubscription(endpoint);
    return res.json(result);
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Scheduler trigger: checks due subscriptions and sends push.
// Protect with CRON_SECRET when set: Authorization: Bearer <secret> or ?secret=<secret>.
// Called by: in-process interval (Render), Vercel Cron, or any external cron.
app.get('/api/cron/dispatch', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided =
        (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.secret;
      // Also allow Vercel Cron's built-in header passthrough without secret in dev
      if (provided !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }
    }
    const dryRun = req.query.dryRun === '1';
    const result = await dispatchDuePush({ dryRun });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Dispatch error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

app.post('/api/cron/dispatch', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided =
        (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
        (req.body && req.body.secret) ||
        req.query.secret;
      if (provided !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }
    }
    const result = await dispatchDuePush({ dryRun: req.body && req.body.dryRun === true });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Dispatch error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Lightweight health check (Render / keep-alive pings)
app.get('/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// Live backgrounds listing — the Customize panel fetches this so any image
// dropped into public/backgrounds/ shows up automatically (no code changes).
// Falls back to the committed manifest.json when the FS is unavailable.
app.get('/api/backgrounds', (_req, res) => {
  try {
    const { scanBackgrounds } = require('./scripts/build-backgrounds');
    const list = scanBackgrounds();
    if (list.length > 0) return res.json({ success: true, backgrounds: list, source: 'scan' });
  } catch (_) {}
  try {
    const manifestPath = path.join(__dirname, 'public', 'backgrounds', 'manifest.json');
    const manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
    return res.json({ success: true, backgrounds: manifest, source: 'manifest' });
  } catch (_) {
    return res.json({ success: true, backgrounds: [], source: 'empty' });
  }
});

// Live OST listing — the speaker (music) panel fetches this so any audio
// dropped into public/ost/ shows up automatically (no code changes).
app.get('/api/ost', (_req, res) => {
  try {
    const { scanOst } = require('./scripts/build-backgrounds');
    const list = scanOst();
    if (list.length > 0) return res.json({ success: true, tracks: list, source: 'scan' });
  } catch (_) {}
  try {
    const manifestPath = path.join(__dirname, 'public', 'ost', 'manifest.json');
    const manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
    return res.json({ success: true, tracks: manifest, source: 'manifest' });
  } catch (_) {
    return res.json({ success: true, tracks: [], source: 'empty' });
  }
});

// Keep the static manifest fresh (covers Render/local; Vercel static deploys
// should run `npm run backgrounds` before committing new images).
try {
  require('./scripts/build-backgrounds').buildManifest();
} catch (_) {}

// ---------- In-process per-minute scheduler (Render / long-lived Node) ----------
// Vercel serverless has no long-lived process, so this only runs where the
// process stays alive (local dev, Render Web Service, VPS, Docker).
// Disable with SCHEDULER_ENABLED=0. Interval default 60s, configurable.
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== '0';
const SCHEDULER_INTERVAL_MS = Math.max(
  15_000,
  parseInt(process.env.SCHEDULER_INTERVAL_MS || '60000', 10) || 60_000
);

let schedulerRunning = false;
async function runSchedulerTick(reason) {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const result = await dispatchDuePush();
    if (result.sent > 0 || result.failed > 0 || result.pruned > 0 || process.env.SCHEDULER_VERBOSE === '1') {
      console.log(`[scheduler:${reason}] checked=${result.checked} due=${result.due} sent=${result.sent} failed=${result.failed} pruned=${result.pruned}`);
    }
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  } finally {
    schedulerRunning = false;
  }
}

if (SCHEDULER_ENABLED && !process.env.VERCEL) {
  // Small startup delay so env/ports settle, then every minute.
  setTimeout(() => runSchedulerTick('startup'), 10_000);
  setInterval(() => runSchedulerTick('interval'), SCHEDULER_INTERVAL_MS);
  console.log(`Push scheduler enabled (every ${Math.round(SCHEDULER_INTERVAL_MS / 1000)}s). Disable with SCHEDULER_ENABLED=0.`);
} else {
  console.log('Push scheduler disabled (serverless or SCHEDULER_ENABLED=0). Use /api/cron/dispatch via Vercel Cron or external cron.');
}

app.listen(PORT, () => {
  console.log(`GTA Clock running on http://localhost:${PORT}`);
});
