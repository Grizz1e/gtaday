const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

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

// Tight body cap for JSON APIs.
app.use(cors());
app.use(express.json({ limit: '10kb' }));

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

app.listen(PORT, () => {
  console.log(`GTA Clock running on http://localhost:${PORT}`);
});
