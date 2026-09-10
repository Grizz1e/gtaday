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

function scanBackgrounds() {
  return scanDir(BACKGROUNDS_DIR, IMAGE_EXTS, '/backgrounds');
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
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + '\n');
  } catch (err) {
    console.warn('Could not write manifest:', manifestPath, err.message);
    return false;
  }
  return true;
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
  buildManifest();
}

module.exports = { buildManifest, scanBackgrounds, scanOst, BACKGROUNDS_DIR };
