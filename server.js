const express = require('express');
const path = require('path');
const fs = require('fs');
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

// Gzip/brotli when the dep is installed; plain passthrough otherwise so the
// server boots identically on hosts without node_modules fully installed.
try {
  const compression = require('compression');
  app.use(compression({ threshold: 1024 }));
} catch (_) {}

// Minimal security headers without an extra dependency (helmet-compatible).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Tight body cap: push endpoints only need a ~1KB JSON subscription.
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Simple in-memory rate limiter (no dep): 60 req/min per IP on write routes.
const _hits = new Map();
function lightRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'anon';
  const arr = (_hits.get(key) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) _hits.clear();
  if (arr.length > 60) return res.status(429).json({ success: false, error: 'Too many requests. Slow down.' });
  next();
}

// Prefer prebuilt minified assets when `npm run build` has generated them,
// fall back to the unminified originals. Long immutable cache for hashed
// media, short cache for html entry points (works on Render + Vercel static).
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get(['/', '/index.html'], (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  next();
});
app.get(['/app.min.js', '/app.js'], (req, res, next) => {
  if (req.path === '/app.js' && fs.existsSync(path.join(PUBLIC_DIR, 'app.min.js'))) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(path.join(PUBLIC_DIR, 'app.min.js'), { maxAge: '1y', immutable: true });
  }
  next();
});
app.get(['/style.min.css', '/style.css'], (req, res, next) => {
  if (req.path === '/style.css' && fs.existsSync(path.join(PUBLIC_DIR, 'style.min.css'))) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(path.join(PUBLIC_DIR, 'style.min.css'), { maxAge: '1y', immutable: true });
  }
  next();
});
app.use(express.static(PUBLIC_DIR, {
  maxAge: '7d',
  immutable: false,
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|avif|gif|mp3|ogg|wav|m4a|flac|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

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
app.post('/api/push-subscribe', lightRateLimit, async (req, res) => {
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
app.post('/api/push-update', lightRateLimit, async (req, res) => {
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
app.post('/api/push-unsubscribe', lightRateLimit, async (req, res) => {
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
// Scans are cached for 5 min: the old code ran readdirSync on every request,
// blocking the event loop per visitor.
const _bgCache = { at: 0, list: null };
const BG_CACHE_TTL_MS = 5 * 60 * 1000;
function getCachedBackgrounds() {
  const now = Date.now();
  if (_bgCache.list && now - _bgCache.at < BG_CACHE_TTL_MS) return _bgCache.list;
  const { scanBackgrounds } = require('./scripts/build-backgrounds');
  const list = scanBackgrounds();
  if (list.length > 0) _bgCache.list = list;
  _bgCache.at = now;
  return _bgCache.list || [];
}
app.get('/api/backgrounds', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  try {
    const list = getCachedBackgrounds();
    if (list.length > 0) return res.json({ success: true, backgrounds: list, source: 'scan' });
  } catch (_) {}
  try {
    const manifestPath = path.join(__dirname, 'public', 'backgrounds', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return res.json({ success: true, backgrounds: manifest, source: 'manifest' });
  } catch (_) {
    return res.json({ success: true, backgrounds: [], source: 'empty' });
  }
});

// Live OST listing — the speaker (music) panel fetches this so any audio
// dropped into public/ost/ shows up automatically (no code changes).
const _ostCache = { at: 0, list: null };
app.get('/api/ost', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  try {
    const now = Date.now();
    if (!_ostCache.list || now - _ostCache.at >= BG_CACHE_TTL_MS) {
      const { scanOst } = require('./scripts/build-backgrounds');
      const list = scanOst();
      if (list.length > 0) _ostCache.list = list;
      _ostCache.at = now;
    }
    if (_ostCache.list && _ostCache.list.length > 0) {
      return res.json({ success: true, tracks: _ostCache.list, source: 'scan' });
    }
  } catch (_) {}
  try {
    const manifestPath = path.join(__dirname, 'public', 'ost', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return res.json({ success: true, tracks: manifest, source: 'manifest' });
  } catch (_) {
    return res.json({ success: true, tracks: [], source: 'empty' });
  }
});

// Keep the static manifest fresh (covers Render/local; Vercel static deploys
// should run `npm run backgrounds` before committing new images).
// Deferred past listen + skipped when unchanged (writeManifest compares
// bytes), so cold starts on Render/Vercel stay fast.
if (!process.env.VERCEL) {
  const refreshManifest = () => {
    try { require('./scripts/build-backgrounds').buildManifest(); } catch (_) {}
  };
  if (typeof setImmediate === 'function') setImmediate(refreshManifest);
  else setTimeout(refreshManifest, 1000);
}

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
