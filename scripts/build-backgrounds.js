#!/usr/bin/env node
// GTA CLOCK — Rebuild media manifests by scanning folders.
// Run: npm run backgrounds
// - Any image in public/backgrounds/ (*.jpg, *.jpeg, *.png, *.webp, *.gif,
//   *.avif) automatically appears in the Customize panel.
// - Any audio in public/ost/ (*.mp3, *.ogg, *.wav, *.m4a, *.flac) automatically
//   appears in the speaker (music) panel.
// The server also runs this on every boot, and /api/backgrounds + /api/ost
// scan live, so on Render/local no manual step is needed. For Vercel static
// deploys, run this before committing so the manifests ship with new files.
const fs = require('fs');
const path = require('path');

const BACKGROUNDS_DIR = path.join(__dirname, '..', 'public', 'backgrounds');
const BACKGROUNDS_MANIFEST = path.join(BACKGROUNDS_DIR, 'manifest.json');
const OST_DIR = path.join(__dirname, '..', 'public', 'ost');
const OST_MANIFEST = path.join(OST_DIR, 'manifest.json');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);

function prettyName(file) {
  const base = file.replace(/\.[^.]+$/, '');
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || file;
}

// Points at the prebuilt 320w thumb when `npm run optimize-images` has
// generated one, otherwise null (client falls back to the full url).
function optimizedThumbUrl(publicUrl) {
  const rel = String(publicUrl || '').replace(/^\//, '');
  if (!rel) return null;
  const thumbRel = rel.replace(/\.[^.]+$/, '.thumb.jpg');
  const abs = path.join(OPTIMIZED_DIR, thumbRel.replace(/^backgrounds\//, 'backgrounds/'));
  try {
    if (fs.existsSync(abs)) return `/backgrounds/.optimized/${thumbRel.replace(/^backgrounds\//, '')}`;
  } catch (_) {}
  return null;
}

function scanBackgrounds() {
  let names = [];
  try {
    names = fs.readdirSync(BACKGROUNDS_DIR, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  const entries = [];
  for (const ent of names) {
    const fullPath = path.join(BACKGROUNDS_DIR, ent.name);
    if (ent.isDirectory()) {
      const px = scanParallaxDir(ent.name, fullPath);
      if (px) entries.push(px);
    } else if (
      IMAGE_EXTS.has(path.extname(ent.name).toLowerCase()) &&
      ent.name.toLowerCase() !== 'manifest.json'
    ) {
      const url = `/backgrounds/${ent.name}`;
      entries.push({
        kind: 'flat',
        file: ent.name,
        name: prettyName(ent.name),
        url,
        thumb: optimizedThumbUrl(url) || url
      });
    }
  }
  entries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return entries;
}

// A subdirectory holding layer files becomes one parallax entry.
// Convention (case-insensitive prefix, any image extension):
//   background.* / foreground.* / full.*
// Missing layers degrade gracefully (hero falls back full -> background -> foreground).
function pickLayerFile(dir, prefix) {
  try {
    const match = fs
      .readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && f.toLowerCase().startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    return match[0] || null;
  } catch (_) {
    return null;
  }
}

function scanParallaxDir(dirName, dirPath) {
  const bg = pickLayerFile(dirPath, 'background');
  const fg = pickLayerFile(dirPath, 'foreground');
  const full = pickLayerFile(dirPath, 'full');
  if (!bg && !fg && !full) return null;
  const hero = full || bg || fg;
  const urlFor = (f) => (f ? `/backgrounds/${dirName}/${f}` : null);
  return {
    kind: 'parallax',
    dir: dirName,
    name: prettyName(dirName),
    background: urlFor(bg),
    foreground: urlFor(fg),
    full: urlFor(hero),
    thumb: urlFor(hero)
  };
}

function scanOst() {
  return scanDir(OST_DIR, AUDIO_EXTS, '/ost');
}

function scanDir(dir, exts, urlPrefix) {
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }

  return files
    .filter(f => exts.has(path.extname(f).toLowerCase()))
    .filter(f => f.toLowerCase() !== 'manifest.json')
    .sort((a, b) => a.localeCompare(b))
    .map(file => ({
      file,
      name: prettyName(file),
      url: `${urlPrefix}/${file}`
    }));
}

function writeManifest(manifestPath, entries) {
  const next = JSON.stringify(entries, null, 2) + '\n';
  try {
    // Skip the write when nothing changed: keeps Render boot fast and
    // avoids touching the read-only FS timestamp on Vercel.
    const prev = fs.readFileSync(manifestPath, 'utf-8');
    if (prev === next) return true;
  } catch (_) {}
  try {
    fs.writeFileSync(manifestPath, next);
  } catch (err) {
    console.warn('Could not write manifest:', manifestPath, err.message);
    return false;
  }
  return true;
}

// ---- Image optimization (npm run optimize-images) ----
// Re-encodes oversized heroes to bounded WebP/AVIF + tiny blurred thumbs for
// the Customize grid. Sharp is a devDependency: if it isn't installed the
// step logs a warning and the existing JPGs keep serving untouched.
// Heroes cap at 1920w q75 (the 2MB+ JPGs drop to ~200-400KB); thumbs are
// 320w q50 (~10-20KB) instead of reusing the full hero.
const OPTIMIZED_DIR = path.join(BACKGROUNDS_DIR, '.optimized');
const HERO_MAX_W = 1920;
const THUMB_W = 320;

async function optimizeImages() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.warn('sharp not installed — skipping image optimization (npm i -D sharp to enable).');
    return { skipped: true };
  }
  const entries = scanBackgrounds();
  let done = 0;
  for (const entry of entries) {
    const sources = entry.kind === 'parallax'
      ? [entry.background, entry.foreground, entry.full].filter(Boolean)
      : [entry.url];
    for (const url of sources) {
      const rel = url.replace(/^\//, '');
      const src = path.join(__dirname, '..', 'public', rel);
      if (!fs.existsSync(src)) continue;
      const ext = path.extname(src).toLowerCase();
      if (ext === '.gif') continue; // never re-encode animation
      const base = path.join(OPTIMIZED_DIR, rel);
      const webp = base.replace(/\.[^.]+$/, '.webp');
      const thumb = base.replace(/\.[^.]+$/, '.thumb.jpg');
      const newest = [webp, thumb].every((f) => {
        try { return fs.statSync(f).mtimeMs >= fs.statSync(src).mtimeMs; } catch (_) { return false; }
      });
      if (newest) continue;
      for (const f of [webp, thumb]) {
        try { fs.mkdirSync(path.dirname(f), { recursive: true }); } catch (_) {}
      }
      await sharp(src).rotate().resize({ width: HERO_MAX_W, withoutEnlargement: true })
        .webp({ quality: 75 }).toFile(webp).catch((e) => console.warn('webp skip', rel, e.message));
      await sharp(src).rotate().resize({ width: THUMB_W, withoutEnlargement: true })
        .jpeg({ quality: 50, progressive: true }).toFile(thumb).catch((e) => console.warn('thumb skip', rel, e.message));
      done++;
    }
    if (entry.kind === 'parallax' && entry.thumb === entry.full) {
      const thumbUrl = entry.full ? entry.full.replace(/\.[^.]+$/, '.thumb.jpg').replace('/backgrounds/', '/backgrounds/.optimized/') : null;
      if (thumbUrl) entry.thumb = thumbUrl;
    }
  }
  if (done) console.log(`optimized ${done} image(s) -> ${OPTIMIZED_DIR}`);
  return { optimized: done };
}

function buildManifest() {
  const backgrounds = scanBackgrounds();
  if (writeManifest(BACKGROUNDS_MANIFEST, backgrounds)) {
    console.log(`wrote ${BACKGROUNDS_MANIFEST} (${backgrounds.length} background(s))`);
  }
  const tracks = scanOst();
  if (writeManifest(OST_MANIFEST, tracks)) {
    console.log(`wrote ${OST_MANIFEST} (${tracks.length} track(s))`);
  }
  return backgrounds;
}

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--optimize')) {
      await optimizeImages().catch((err) => console.warn('optimize skipped:', err.message));
    }
    buildManifest();
  })();
}

module.exports = { buildManifest, scanBackgrounds, scanOst, optimizeImages, BACKGROUNDS_DIR };
